import React from 'react';
import moment from 'moment';
import { styled } from 'bappo-components';
import utils from 'utils';

const {
  getForecastEntryKey,
  getForecastEntryKeyByDate,
  getFinancialYear,
  monthCalendarToFinancial,
} = utils;

const forecastTypeLabelToValue = label => {
  switch (label.toString()) {
    case 'Cost':
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
      return 'Cost';
    case '2':
      return 'Revenue';
    default:
      return null;
  }
};

class ForecastMatrix extends React.Component {
  state = {
    loading: true,
    costTypes: ['Cost'],
    revenueTypes: ['Revenue'],
    entries: {}, // ProjectForecastEntry map
    financialYear: null, // Which financial year is being viewed now (project might last over one financial year)
    months: [], // lasting months of the project, e.g. [{ calendarMonth: 2018, calendarMonth: 1}] for Jan 2018
  };

  async componentWillMount() {
    await this.setFilters();
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
      },
    });
  };

  loadData = async () => {
    const { project, costTypes, revenueTypes } = this.state;
    if (!project) return;

    const { ProjectForecastEntry, RosterEntry } = this.props.$models;
    const months = [];
    const entries = {};

    // Get months for this project
    const startDate = moment(project.startDate);
    const endDate = moment(project.endDate);
    const financialYear = getFinancialYear(startDate);

    while (
      endDate > startDate ||
      startDate.format('M') === endDate.format('M')
    ) {
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
      const key = getForecastEntryKeyByDate(
        rosterEntry.date,
        'Cost from Roster',
      );
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

    // Create new entries for empty cells
    costTypes.concat(revenueTypes).forEach(type => {
      months.forEach(month => {
        const key = getForecastEntryKey(
          month.calendarYear,
          month.calendarMonth,
          type,
        );

        if (!entries[key]) {
          const financialMonth = monthCalendarToFinancial(month.calendarMonth);
          entries[key] = {
            forecastType: forecastTypeLabelToValue(type),
            financialYear,
            financialMonth,
            project_id: project.id,
            amount: 0,
          };
        }
      });
    });

    await this.setState({
      loading: false,
      entries,
      financialYear,
      months,
    });
    this.calculateMargins();
  };

  handleCellChange = async (entry, amount) => {
    const key = getForecastEntryKey(
      entry.financialYear,
      entry.financialMonth,
      forecastTypeValueToLabel(entry.forecastType),
      true,
    );

    await this.setState(state => {
      const { entries } = state;
      entries[key].amount = +amount;
      return {
        ...state,
        entries: this.calculateMargins(entries),
      };
    });
    this.calculateMargins();
  };

  calculateMargins = () => {
    const { entries, months } = this.state;
    const entiresWithMargins = Object.assign({}, entries);

    months.forEach(month => {
      const key = getForecastEntryKey(
        month.calendarYear,
        month.calendarMonth,
        'Margin',
      );

      const revenueEntry =
        entries[
          getForecastEntryKey(
            month.calendarYear,
            month.calendarMonth,
            'Revenue',
          )
        ];

      const costFromRosterEntry =
        entries[
          getForecastEntryKey(
            month.calendarYear,
            month.calendarMonth,
            'Cost from Roster',
          )
        ];

      const margin =
        +(revenueEntry && revenueEntry.amount) -
        +(costFromRosterEntry && costFromRosterEntry.amount);

      entiresWithMargins[key] = {
        financialYear: month.year,
        financialMonth: month.month,
        amount: margin,
      };
    });

    return this.setState(state => ({
      ...state,
      entries: entiresWithMargins,
    }));
  };

  save = async () => {
    this.setState({ saving: true });
    const { ProjectForecastEntry } = this.props.$models;
    const { project, financialYear, entries } = this.state;

    // Delete old entries
    // TODO: use $in when bug is fixed
    await ProjectForecastEntry.destroy({
      where: {
        forecastType: '1',
        project_id: project.id,
        financialYear: financialYear.toString(),
      },
    });
    await ProjectForecastEntry.destroy({
      where: {
        forecastType: '2',
        project_id: project.id,
        financialYear: financialYear.toString(),
      },
    });

    const entriesToCreate = Object.values(entries).filter(
      entry => entry.forecastType === '1' || entry.forecastType === '2',
    );

    await ProjectForecastEntry.bulkCreate(entriesToCreate);

    this.setState({ saving: false });
  };

  renderMargins = () => {
    return (
      <RowSubTotal>
        <RowLabel style={{ fontWeight: 'bold' }}>Margin</RowLabel>
        {this.state.months.map(month => {
          const key = getForecastEntryKey(
            month.calendarYear,
            month.calendarMonth,
            'Margin',
          );
          const entry = this.state.entries[key];
          return <TotalCell>{entry && entry.amount}</TotalCell>;
        })}
      </RowSubTotal>
    );
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
    const key = getForecastEntryKey(
      month.calendarYear,
      month.calendarMonth,
      type,
    );
    const entry = this.state.entries[key];
    let value = entry && entry.amount;
    if (+value === 0) value = ''; // Don't show 0 in the table

    return (
      <Cell>
        <Input
          disabled={disabled}
          value={value}
          onChange={event => this.handleCellChange(entry, event.target.value)}
        />
      </Cell>
    );
  };

  render() {
    const {
      loading,
      saving,
      project,
      financialYear,
      months,
      costTypes,
      revenueTypes,
    } = this.state;

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

    console.log(this.state.entries);
    return (
      <Container saving={saving}>
        <HeaderContainer>
          <Heading>
            Project: {project.name}, financial year: {financialYear}
          </Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {months.map((month, index) => {
            return (
              <Cell>
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
            // Only display months of one financial year
            // if (true || month.calendarYear === financialYear) {
            // }
            // return null;
          })}
        </HeaderRow>
        {costTypes.map(this.renderRow)}
        {this.renderRow('Cost from Roster', true)}
        {revenueTypes.map(this.renderRow)}
        {this.renderMargins()}
        <SaveButton onClick={this.save}>Save</SaveButton>
      </Container>
    );
  }
}

export default ForecastMatrix;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid #eee;
  line-height: 30px;
`;

const RowSubTotal = styled(Row)`
  border-top: 1px solid black;
  border-bottom: 1px solid black;
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
  padding-left: 1px;
  padding-right: 1px;
  display: flex;
  flex-direction: row;
  flex: 1;
  justify-content: center;
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

// const getZeroTotals = () => {
//   const t = {
//     cos: {},
//     rev: {},
//     oh: {},
//     gp: {},
//     np: {},
//   };

//   for (let month of months) {
//     t.cos[month] = 0.0;
//     t.rev[month] = 0.0;
//     t.oh[month] = 0.0;
//     t.gp[month] = 0.0;
//     t.np[month] = 0.0;
//   }

//   return t;
// };

const Container = styled.div`
  ${props =>
    props.saving ? 'filter: blur(3px); opacity: 0.5;' : ''} margin-top: 50px;
  overflow-y: scroll;
`;

const TotalCell = styled.div`
  text-align: center;
  flex: 1;
  font-weight: bold;
`;

const Space = styled.div`
  height: 50px;
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
