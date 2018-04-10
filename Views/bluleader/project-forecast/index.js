import React from 'react';
import moment from 'moment';
import { styled } from 'bappo-components';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import {
  getForecastEntryKey,
  getForecastEntryKeyByDate,
  getFinancialTimeFromDate,
  calendarToFinancial,
} from 'utils';

const forecastTypeLabelToValue = label => {
  switch (label.toString()) {
    case 'Planned Cost':
      return '1';
    case 'Revenue':
      return '2';
    default:
      return null;
  }
};

const forecastTypeValueToLabel = value => {
  switch (value.toString()) {
    case '1':
      return 'Planned Cost';
    case '2':
      return 'Revenue';
    default:
      return null;
  }
};

class ForecastMatrix extends React.Component {
  state = {
    loading: true,
    project: null,
    entries: {}, // ProjectForecastEntry map
    months: [], // lasting months of the project, e.g. [{ calendarMonth: 2018, calendarMonth: 1}] for Jan 2018
  };

  async componentWillMount() {
    // Load user preferences
    const prefs = await getUserPreferences(this.props.$global.currentUser.id, this.props.$models);
    const { project_id } = prefs;

    if (!project_id) await this.setFilters();
    else {
      const project = await this.props.$models.Project.findById(project_id);
      await this.setState({ project });
      await this.loadData();
    }
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { project } = this.state;

    const projects = await $models.Project.findAll({
      limit: 10000,
    });

    const projectOptions = projects.reduce((arr, pro) => {
      // Only list 'Fixed Price' projects
      if (pro.projectType === '3') {
        return [
          ...arr,
          {
            id: pro.id,
            label: pro.name,
          },
        ];
      }
      return arr;
    }, []);

    $popup.form({
      fields: [
        {
          name: 'projectId',
          label: 'Project',
          type: 'FixedList',
          properties: {
            options: projectOptions,
          },
          validate: [value => (value ? undefined : 'Required')],
        },
      ],
      initialValues: {
        projectId: project && project.id,
      },
      onSubmit: async ({ projectId }) => {
        const chosenProject = projects.find(p => p.id === projectId);
        await this.setState({
          project: chosenProject,
        });
        await this.loadData();
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          project_id: projectId,
        });
      },
    });
  };

  loadData = async () => {
    const { project } = this.state;
    if (!project) return;

    const { ProjectForecastEntry, RosterEntry } = this.props.$models;
    const months = [];
    const entries = {};

    // Get months for this project
    const startDate = moment(project.startDate);
    const endDate = moment(project.endDate);
    const { financialYear } = getFinancialTimeFromDate(startDate);

    while (endDate > startDate || startDate.format('M') === endDate.format('M')) {
      months.push({
        calendarYear: startDate.year(),
        calendarMonth: startDate.month() + 1,
      });
      startDate.add(1, 'month');
    }

    // Calculate entries of the row 'Cost from Roster'
    const rosterEntries = await RosterEntry.findAll({
      where: {
        project_id: project.id,
      },
      include: [{ as: 'consultant' }],
      limit: 10000,
    });

    rosterEntries.forEach(rosterEntry => {
      const key = getForecastEntryKeyByDate(rosterEntry.date, 'Cost from Roster');
      const dailyRate = rosterEntry.consultant.internalRate
        ? +rosterEntry.consultant.internalRate
        : 0;

      // Only amount is used for entries in this row
      if (!entries[key]) {
        entries[key] = {
          amount: dailyRate,
        };
      } else {
        entries[key].amount += dailyRate;
      }
    });

    // Build entry map
    const entriesArray = await ProjectForecastEntry.findAll({
      limit: 100000,
      where: {
        project_id: project.id,
      },
    });

    entriesArray.forEach(entry => {
      const key = getForecastEntryKey(
        entry.financialYear,
        entry.financialMonth,
        forecastTypeValueToLabel(entry.forecastType),
        true,
      );
      entries[key] = entry;
    });

    await this.setState({
      loading: false,
      entries,
      months,
    });
    this.calculateMargins();
  };

  handleCellChange = async (month, type, amount) => {
    if (isNaN(amount)) return;

    const { calendarYear, calendarMonth } = month;
    const { financialYear, financialMonth } = calendarToFinancial(month);
    const key = getForecastEntryKey(calendarYear, calendarMonth, type);

    await this.setState(state => {
      const { entries } = state;
      entries[key] = {
        forecastType: forecastTypeLabelToValue(type),
        financialYear,
        financialMonth,
        project_id: this.state.project.id,
        amount: +amount,
      };
      return {
        ...state,
        entries,
      };
    });
    this.calculateMargins();
  };

  calculateMargins = () => {
    const { entries, months } = this.state;
    const entriesWithMargins = Object.assign({}, entries);

    months.forEach(month => {
      const plannedMarginKey = getForecastEntryKey(
        month.calendarYear,
        month.calendarMonth,
        'Planned Margin',
      );
      const actualMarginKey = getForecastEntryKey(
        month.calendarYear,
        month.calendarMonth,
        'Actual Margin',
      );

      const revenueEntry =
        entries[getForecastEntryKey(month.calendarYear, month.calendarMonth, 'Revenue')];

      const costFromRosterEntry =
        entries[getForecastEntryKey(month.calendarYear, month.calendarMonth, 'Cost from Roster')];

      const plannedCostEntry =
        entries[getForecastEntryKey(month.calendarYear, month.calendarMonth, 'Planned Cost')];

      // calculate planned and actual margins
      const plannedMargin =
        +((revenueEntry && revenueEntry.amount) || 0) -
        +((plannedCostEntry && plannedCostEntry.amount) || 0);

      const actualMargin =
        +((revenueEntry && revenueEntry.amount) || 0) -
        +((costFromRosterEntry && costFromRosterEntry.amount) || 0);

      entriesWithMargins[plannedMarginKey] = {
        financialYear: month.year,
        financialMonth: month.month,
        amount: plannedMargin,
      };

      entriesWithMargins[actualMarginKey] = {
        financialYear: month.year,
        financialMonth: month.month,
        amount: actualMargin,
      };
    });

    return this.setState(state => ({
      ...state,
      entries: entriesWithMargins,
    }));
  };

  save = async () => {
    this.setState({ saving: true });
    const { ProjectForecastEntry } = this.props.$models;
    const { project, entries } = this.state;

    // Delete old entries
    await ProjectForecastEntry.destroy({
      where: {
        forecastType: {
          $in: ['1', '2'],
        },
        project_id: project.id,
      },
    });

    const entriesToCreate = Object.values(entries).filter(
      entry => entry.forecastType === '1' || entry.forecastType === '2',
    );

    await ProjectForecastEntry.bulkCreate(entriesToCreate);

    this.setState({ saving: false });
  };

  renderRow = (type, disabled) => (
    <Row>
      <RowLabel>
        <span>{type}</span>
      </RowLabel>
      {this.state.months.map(month => this.renderCell(month, type, disabled))}
    </Row>
  );

  renderCell = (month, type, disabled = false) => {
    const key = getForecastEntryKey(month.calendarYear, month.calendarMonth, type);
    const entry = this.state.entries[key];
    const value = entry && entry.amount;

    const isMargin = type === 'Planned Margin' || type === 'Actual Margin';

    return (
      <Cell isMargin={isMargin}>
        <Input
          disabled={disabled}
          value={value}
          onChange={event => this.handleCellChange(month, type, event.target.value)}
        />
      </Cell>
    );
  };

  render() {
    const { loading, saving, project, months } = this.state;

    if (!project) {
      return (
        <Loading>
          Please specify a project to continue.
          <TextButton onClick={this.setFilters}>change</TextButton>
        </Loading>
      );
    }
    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    return (
      <Container saving={saving}>
        <TableContainer>
          <HeaderContainer>
            <Heading>Project: {project.name}</Heading>
            <TextButton onClick={this.setFilters}>change</TextButton>
          </HeaderContainer>
          <HeaderRow>
            <RowLabel />
            {months.map((month, index) => {
              return (
                <Cell style={{ border: 'none' }}>
                  {(index === 0 || month.calendarMonth === 1) && (
                    <YearLabel>{month.calendarYear}</YearLabel>
                  )}
                  <HeaderLabel>
                    {moment()
                      .month(month.calendarMonth - 1)
                      .format('MMM')}
                  </HeaderLabel>
                </Cell>
              );
            })}
          </HeaderRow>
          {this.renderRow('Revenue')}
          <Space />
          {this.renderRow('Planned Cost')}
          {this.renderRow('Planned Margin', true)}
          <Space />
          {this.renderRow('Cost from Roster', true)}
          {this.renderRow('Actual Margin', true)}
        </TableContainer>

        <SaveButton onClick={this.save}>Save</SaveButton>
      </Container>
    );
  }
}

export default ForecastMatrix;

const Container = styled.div`
  margin-top: 50px;
  overflow-y: scroll;
  ${props => (props.blur ? 'filter: blur(3px); opacity: 0.5;' : '')};
`;

const TableContainer = styled.div`
  overflow-x: scroll;
`;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  line-height: 30px;
`;

const Space = styled.div`
  height: 30px;
`;

const HeaderRow = styled(Row)`
  border: none;
  color: gray;
  font-weight: bold;
`;

const RowLabel = styled.div`
  flex: none;
  width: 240px;
`;

const Cell = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 150px;
  ${props => props.isMargin && 'border-top: 1px solid #eee; font-weight: bold;'};
`;

const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

const Input = styled.input`
  flex: 1;
  width: 0px;
  border: none;
  text-align: center;
  padding-right: 5px;
  font-size: 11pt;
  border-bottom: 1px solid white;
  &:focus {
    outline: none;
    border-bottom: 1px solid gray;
  }
`;

const SaveButton = styled.div`
  color: white;
  border-radius: 3px;
  background-color: orange;
  line-height: 40px;
  padding: 0px 40px;
  cursor: pointer;
  display: inline-block;
  float: right;
  margin: 20px 30px;
  &:hover {
    opacity: 0.7;
  }
`;

const Loading = styled.div`
  color: #ddd;
  margin-top: 50px;
  display: flex;
  justify-content: center;
`;

const HeaderContainer = styled.div`
  margin: 30px;
  margin-top: 0;
  display: flex;
`;

const TextButton = styled.span`
  font-size: 13px;
  color: grey;
  margin-left: 20px;
  margin-top: 3px;

  &:hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const Heading = styled.div`
  font-size: 18px;
`;

const YearLabel = styled.div`
  position: absolute;
  bottom: 20px;
  font-weight: lighter;
  font-size: 12px;
`;
