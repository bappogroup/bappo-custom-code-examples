import React from 'react';
import moment from 'moment';
import { styled } from 'bappo-components';
import { getForecastEntryKey } from 'utils';

class ForecastMatrix extends React.Component {
  state = {
    loading: true,
    forecastTypes: [],
    entries: {}, // ProjectForecastEntry map
    financialYear: null, // Which financial year is being viewed now (project might last over one financial year)
    months: [], // lasting months of the project, e.g. [{ year: 2018, month: 0}] for Jan 2018
    totals: null,
  };

  async componentWillMount() {
    const forecastTypes = this.props.$models.ProjectForecastEntry.fields
      .find(field => field.name === 'forecastType')
      .properties.options.map(option => option.label);
    this.setState(state => ({
      ...state,
      forecastTypes,
    }));
    await this.setFilters();
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { project } = this.state;

    const projects = await $models.Project.findAll({
      limit: 1000,
    });

    const projectOptions = projects.reduce((arr, pro) => {
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
    const { project } = this.state;
    if (!project) return;

    const { Project, ProjectForecastEntry } = this.props.$models;
    const months = [];

    // Get months for this project
    const startDate = moment(project.startDate);
    const endDate = moment(project.endDate);
    const financialYear = startDate.year();

    while (
      endDate > startDate ||
      startDate.format('M') === endDate.format('M')
    ) {
      months.push({
        year: startDate.year(),
        month: startDate.month(),
      });
      startDate.add(1, 'month');
    }

    // Build entry map
    const entriesArray = await ProjectForecastEntry.findAll({
      limit: 100000,
      where: {
        project_id: project.id,
      },
    });

    const entries = {};
    entriesArray.forEach(entry => {
      const key = getForecastEntryKey(
        entry.financialYear,
        entry.financialMonth,
        entry.forecastType,
        true,
      );
      entries[key] = entry;
    });

    await this.setState({
      loading: false,
      entries,
      financialYear,
      months,
    });
  };

  // handleCellChange = (entry, amt) => {
  //   const key = getEntryKey(entry);
  //   const revisedEntry = {};
  //   const sign = amt.includes('-') ? '-' : '';
  //   let amount = sign + amt.replace(/[^0-9.]+/g, '').replace(/^0+/g, '');
  //   revisedEntry[key] = { ...this.state.entries[key], amount, changed: true };
  //   const entries = { ...this.state.entries, ...revisedEntry };
  //   this.setState({
  //     entries,
  //     totals: this.calcTotals(entries),
  //   });
  // };

  calculateMargins = entries => {
    const entiresWithMargins = Object.assign({}, entries);

    this.state.months.forEach(month => {
      const key = getForecastEntryKey(month.year, month.month, 'Margin');
      const margin =
        entries[getForecastEntryKey(month.year, month.month, 'Revenue')] -
        entries[
          getForecastEntryKey(month.year, month.month, 'Cost from Roster')
        ];

      entiresWithMargins[key] = {
        financialYear: month.year,
        financialMonth: month.month,
        amount: margin,
      };
    });

    return entiresWithMargins;
  };

  renderRow = type => (
    <Row>
      <RowLabel>
        <span>{type}</span>
      </RowLabel>
      {this.state.months.map(month => this.renderCell(month, type))}
    </Row>
  );

  renderCell = (month, type, disabled = false) => {
    const key = getForecastEntryKey(month.year, month.month, type);
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

  // // Calculate all rows that need to, update db, reload data and calculate total
  // calculateRows = async () => {
  //   this.setState({ saving: true });

  //   const { profitCentre, financialYear } = this.state;

  //   await calculateForecast({
  //     $models: this.props.$models,
  //     financialYear,
  //     profitCentreIds: [profitCentre.id],
  //   });

  //   await this.loadData();

  //   await this.setState(state => ({
  //     totals: this.calcTotals(state.entries),
  //     saving: false,
  //   }));
  // };

  render() {
    const {
      loading,
      saving,
      project,
      financialYear,
      months,
      forecastTypes,
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

    console.log(this.state);
    return (
      <Container saving={saving}>
        <HeaderContainer>
          <Heading>
            Project: {project.name}, financial year: {financialYear}
          </Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
          <TextButton onClick={this.calculateRows}>calculate</TextButton>
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {months.map(month => {
            // Only display months of one financial year
            if (month.year === financialYear) {
              return (
                <Cell>
                  <HeaderLabel>
                    {moment()
                      .month(month.month)
                      .format('MMM')}
                  </HeaderLabel>
                </Cell>
              );
            }
            return null;
          })}
        </HeaderRow>
        {forecastTypes.map(this.renderRow)}
        <SaveButton onClick={this.save}> Save </SaveButton>
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
