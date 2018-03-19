import React from 'react';
import moment from 'moment';
import { styled } from 'bappo-components';
import { getForecastEntryKey } from 'utils';

const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const monthLabels = [
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
];

class ForecastMatrix extends React.Component {
  state = {
    loading: true,
    profitCentre: null,
    entries: {},
    months: [],
  };

  async componentDidMount() {
    await this.setFilters();
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { project, financialYear } = this.state;

    const projects = await $models.Project.findAll({
      limit: 1000,
    });

    const projectOptions = projects.reduce((arr, pro) => {
      if (pro.projectType === '3')
        return [
          ...arr,
          {
            id: pro.id,
            label: pro.name,
          },
        ];
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
        const project = projects.find(p => p.id === projectId);
        await this.setState({
          project,
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
    let startDate = moment(project.startDate);
    const endDate = moment(project.endDate);
    while (
      endDate > startDate ||
      startDate.format('M') === endDate.format('M')
    ) {
      months.push(startDate.month());
      startDate.add(1, 'month');
    }

    // Build entry map
    const entries_array = await ProjectForecastEntry.findAll({
      limit: 100000,
      where: {
        project_id: project.id,
      },
    });

    const entries = {};
    for (let entry of entries_array) {
      const key = getForecastEntryKey(
        entry.financialYear,
        entry.financialMonth,
        entry.forecastType,
      );
      entries[key] = entry;
    }

    //   for (let element of elements) {
    //     if (element.key) {
    //       switch (element.key) {
    //         case 'SAL':
    //           consultantSalariesElement = element;
    //           break;
    //         case 'TMREV':
    //           serviceRevenueElement = element;
    //           break;
    //         case 'CWAGES':
    //           contractorWagesElement = element;
    //           break;
    //         default:
    //       }
    //     } else {
    //       // other elements
    //       switch (element.elementType) {
    //         case '1':
    //           cos_elements.push(element);
    //           break;
    //         case '2':
    //           rev_elements.push(element);
    //           break;
    //         case '3':
    //           oh_elements.push(element);
    //           break;
    //         default:
    //       }
    //     }

    //     // Create new entries for empty cells
    //     for (let month of months) {
    //       const key = getForecastEntryKey(financialYear, month, element.id);
    //       entries[key] = entries[key] || newEntry(financialYear, month, element);
    //     }
    //   }

    //   await this.setState({
    //     loading: false,
    //     entries,
    //     costCenters,
    //     elements,
    //     cos_elements,
    //     rev_elements,
    //     oh_elements,
    //     serviceRevenueElement,
    //     consultantSalariesElement,
    //     contractorWagesElement,
    //     totals: this.calcTotals(entries),
    //   });
    await this.setState({
      loading: false,
      entries,
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

  // renderRow = element => {
  //   return (
  //     <Row>
  //       <RowLabel>
  //         <span>{element.name}</span>
  //       </RowLabel>
  //       {months.map(month => this.renderCell(month, element))}
  //     </Row>
  //   );
  // };

  renderCell = (month, element, disabled = false) => {
    const key = getForecastEntryKey(
      this.state.financialYear,
      month,
      element.id,
    );
    const entry = this.state.entries[key];
    if (!entry) return <Cell> ... </Cell>;

    return (
      <Cell>
        <Input
          disabled={disabled}
          value={+entry.amount !== 0 ? entry.amount : ''}
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

  // calcTotals = entries => {
  //   const tot = getZeroTotals(months);

  //   for (let key of Object.keys(entries)) {
  //     const entry = entries[key];
  //     if (entry.forecastElement) {
  //       const amt = Number(entry.amount);
  //       if (amt !== 0) {
  //         switch (entry.forecastElement.elementType) {
  //           case '1':
  //             tot.cos[entry.financialMonth] += amt;
  //             tot.gp[entry.financialMonth] += -amt;
  //             tot.np[entry.financialMonth] += -amt;
  //             break;
  //           case '2':
  //             tot.rev[entry.financialMonth] += amt;
  //             tot.gp[entry.financialMonth] += amt;
  //             tot.np[entry.financialMonth] += amt;
  //             break;
  //           case '3':
  //             tot.oh[entry.financialMonth] += amt;
  //             tot.np[entry.financialMonth] += -amt;
  //             break;
  //           default:
  //           // do nothing
  //         }
  //       }
  //     }
  //   }
  //   return tot;
  // };

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
        <HeaderContainer>
          <Heading>Project: {project.name}</Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
          <TextButton onClick={this.calculateRows}>calculate</TextButton>
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {months.map(month => (
            <Cell>
              <HeaderLabel>
                {moment()
                  .month(month)
                  .format('MMM')}
              </HeaderLabel>
            </Cell>
          ))}
        </HeaderRow>
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

const getZeroTotals = () => {
  const t = {
    cos: {},
    rev: {},
    oh: {},
    gp: {},
    np: {},
  };

  for (let month of months) {
    t.cos[month] = 0.0;
    t.rev[month] = 0.0;
    t.oh[month] = 0.0;
    t.gp[month] = 0.0;
    t.np[month] = 0.0;
  }

  return t;
};

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
