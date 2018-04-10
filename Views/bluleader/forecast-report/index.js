import React from 'react';
import moment from 'moment';
import { ActivityIndicator, styled } from 'bappo-components';
import {
  financialToCalendar,
  getWageRosterEntries,
  getServiceRevenueRosterEntries,
  getConsultantSalariesByMonth,
  getInternalRevenue,
  getInternalCharge,
  getFixPriceRevenues,
} from 'utils';

const getTableKey = (x, y) => `${x}.${y}`;

const consultantForecastElements = [
  {
    key: 'TMREV',
    name: 'Service Revenue',
  },

  {
    key: 'SAL',
    name: 'Consultant Salaries',
  },
  {
    key: 'CWAGES',
    name: 'Contractor Wages',
  },
  {
    key: 'INTREV',
    name: 'Internal Revenue',
  },
  {
    key: 'INTCH',
    name: 'Internal Charge',
  },
];

const projectForecastElements = [
  {
    key: 'FIXREV',
    name: 'Fix Price Services',
  },
];

class ForecastReport extends React.Component {
  state = {
    consultantElements: null,
    name: null,
    loading: false,
    consultants: this.props.consultants,
    externalConsultants: [],
    consultantEntries: {},
    consultantTotals: {},
    projectTotals: {},
    showTables: [],
  };

  async componentDidUpdate(prevProps) {
    const {
      $models,
      elementKey,
      financialYear,
      financialMonth,
      profitCentreIds,
      // from calculationBaseData:
      allConsultants,
      costCenters,
      consultants,
      projects,
      projectAssignmentLookup,
    } = this.props;

    if (!(consultants && financialYear && financialMonth)) return;
    const { calendarYear, calendarMonth } = financialToCalendar({
      financialYear,
      financialMonth,
    });

    if (
      prevProps.elementKey !== this.props.elementKey ||
      prevProps.financialYear !== this.props.financialYear ||
      prevProps.financialMonth !== this.props.financialMonth
    ) {
      await this.setState({ loading: true });
      // Update selected forecast consultantElements
      const consultantElements = elementKey
        ? consultantForecastElements.filter(e => e.key === elementKey)
        : consultantForecastElements.slice();
      const projectElements = elementKey
        ? projectForecastElements.filter(e => e.key === elementKey)
        : projectForecastElements.slice();

      // Calculate report data, store in consultantEntries
      const consultantEntries = {};
      const projectEntries = {};
      const externalConsultants = [];
      const fixProjects = [];
      const promises = [];
      const showTables = [];

      // Date range: 1 month
      const startDate = moment({
        year: calendarYear,
        month: calendarMonth - 1,
        day: 1,
      });
      const endDate = startDate.clone().add(1, 'month');

      for (const element of consultantElements) {
        switch (element.key) {
          case 'CWAGES': {
            if (!showTables.includes('consultant')) showTables.push('consultant');
            // Contractor wages
            const promise = getWageRosterEntries({
              $models,
              calendarYear,
              calendarMonth,
              consultants,
            }).then(wageRosterEntries => {
              wageRosterEntries.forEach(entry => {
                const key = getTableKey(entry.consultant.name, 'Contractor Wages');
                if (!consultantEntries[key]) consultantEntries[key] = 0;
                consultantEntries[key] += +entry.consultant.dailyRate;
              });
            });
            promises.push(promise);
            break;
          }
          case 'SAL': {
            if (!showTables.includes('consultant')) showTables.push('consultant');
            // Consultant salaries
            const consultantSalaries = getConsultantSalariesByMonth({
              consultants,
              financialYear,
              financialMonth,
            });
            consultantSalaries.forEach(({ consultant, salary }) => {
              const key = getTableKey(consultant.name, 'Consultant Salaries');
              consultantEntries[key] = salary;
            });
            break;
          }
          case 'TMREV': {
            if (!showTables.includes('consultant')) showTables.push('consultant');
            const promise = getServiceRevenueRosterEntries({
              $models,
              calendarYear,
              calendarMonth,
              projects,
              projectAssignmentLookup,
            }).then(revenues => {
              Object.entries(revenues).forEach(([consultantName, revenue]) => {
                if (
                  !consultants.find(c => c.name === consultantName) &&
                  !externalConsultants.find(c => c.name === consultantName)
                ) {
                  externalConsultants.push({ name: consultantName });
                }
                const key = getTableKey(consultantName, 'Service Revenue');
                consultantEntries[key] = revenue;
              });
            });
            promises.push(promise);
            break;
          }
          case 'INTREV': {
            if (!showTables.includes('consultant')) showTables.push('consultant');
            // Internal Revenue
            const promise = getInternalRevenue({
              $models,
              consultants,
              startDate,
              endDate,
              profitCentreIds,
              projectAssignmentLookup,
            }).then(internalRevenues => {
              internalRevenues.forEach(({ consultant, internalRate }) => {
                const key = getTableKey(consultant.name, 'Internal Revenue');
                if (!consultantEntries[key]) consultantEntries[key] = 0;
                consultantEntries[key] -= +internalRate;
              });
            });
            promises.push(promise);
            break;
          }
          case 'INTCH': {
            if (!showTables.includes('consultant')) showTables.push('consultant');
            // Internal Charge
            const promise = getInternalCharge({
              $models,
              allConsultants,
              costCenters,
              startDate,
              endDate,
              projects,
              projectAssignmentLookup,
            }).then(internalCharges => {
              internalCharges.forEach(({ consultant, internalRate }) => {
                if (
                  !consultants.find(c => c.name === consultant.name) &&
                  !externalConsultants.find(c => c.name === consultant.name)
                ) {
                  externalConsultants.push({ name: consultant.name });
                }
                const key = getTableKey(consultant.name, 'Internal Charge');
                if (!consultantEntries[key]) consultantEntries[key] = 0;
                consultantEntries[key] += +internalRate;
              });
            });
            promises.push(promise);
            break;
          }
          default:
        }
      }

      for (const element of projectElements) {
        switch (element.key) {
          case 'FIXREV': {
            if (!showTables.includes('project')) showTables.push('project');
            // Fix price services
            const promise = getFixPriceRevenues({
              $models,
              projects,
              financialYear,
              financialMonth,
            }).then(revenues => {
              Object.entries(revenues).forEach(([projectName, revenue]) => {
                fixProjects.push({ name: projectName });
                const key = getTableKey(projectName, 'Fix Price Services');
                if (!projectEntries[key]) projectEntries[key] = 0;
                projectEntries[key] += +revenue;
              });
            });
            promises.push(promise);
            break;
          }
          default:
        }
      }

      await Promise.all(promises);

      // Totals
      const consultantTotals = {};
      consultantElements.forEach(element => {
        let total = 0;
        consultants.concat(externalConsultants).forEach(({ name }) => {
          const key = getTableKey(name, element.name);
          if (consultantEntries[key]) total += consultantEntries[key];
        });

        consultantTotals[element.name] = total;
      });

      const projectTotals = {};
      projectElements.forEach(element => {
        let total = 0;

        fixProjects.forEach(({ name }) => {
          const key = getTableKey(name, element.name);
          if (projectEntries[key]) total += projectEntries[key];
        });
        projectTotals[element.name] = total;
      });

      this.setState({
        loading: false,
        showTables: this.props.showTables || showTables,
        consultants,
        fixProjects,
        externalConsultants,
        consultantEntries,
        projectEntries,
        consultantTotals,
        consultantElements,
        projectElements,
        projectTotals,
        name: `Report of ${moment()
          .month(calendarMonth - 1)
          .format('MMM')}, ${calendarYear}`,
      });
    }
  }

  renderConsultantTable = () => {
    const {
      consultants,
      externalConsultants,
      consultantEntries,
      consultantElements,
      consultantTotals,
    } = this.state;
    return (
      <div>
        <Row style={{ borderTop: 'none' }}>
          <RowLabel />
          {consultantElements.map(element => <Cell>{element.name}</Cell>)}
        </Row>
        {consultants.length > 0 && <Row style={{ borderTop: 'none' }}>Consultants:</Row>}
        {consultants.map(consultant =>
          this.renderRow(consultant.name, consultantEntries, consultantElements),
        )}
        {externalConsultants.length > 0 && (
          <Row style={{ borderTop: 'none', marginTop: 30 }}>External Consultants:</Row>
        )}
        {externalConsultants.map(consultant =>
          this.renderRow(consultant.name, consultantEntries, consultantElements),
        )}
        <Row style={{ borderTop: '1px solid black' }}>
          <RowLabel>Total</RowLabel>
          {consultantElements.map(element => <Cell>{consultantTotals[element.name] || 0}</Cell>)}
        </Row>
      </div>
    );
  };

  renderProjectTable = () => {
    const { fixProjects, projectEntries, projectElements, projectTotals } = this.state;
    return (
      <div style={{ marginTop: 30 }}>
        {fixProjects.length > 0 && <Row style={{ borderTop: 'none' }}>Projects:</Row>}
        <Row style={{ borderTop: 'none' }}>
          <RowLabel />
          {projectElements.map(element => <Cell>{element.name}</Cell>)}
        </Row>
        {fixProjects.map(project => this.renderRow(project.name, projectEntries, projectElements))}
        <Row style={{ borderTop: '1px solid black' }}>
          <RowLabel>Total</RowLabel>
          {projectElements.map(element => <Cell>{projectTotals[element.name] || 0}</Cell>)}
        </Row>
      </div>
    );
  };

  renderRow = (name, entries, consultantElements) => (
    <Row>
      <RowLabel>{name}</RowLabel>
      {consultantElements.map(element => {
        const key = getTableKey(name, element.name);
        return <Cell>{entries[key] || 0}</Cell>;
      })}
    </Row>
  );

  render() {
    const { loading, name, consultantElements, showTables } = this.state;
    // return 'Loading...';
    if (loading) return <ActivityIndicator />;
    if (!(name && consultantElements && this.props.financialMonth && this.props.financialYear))
      return null;

    return (
      <Container>
        <Title>{name}</Title>
        {showTables.includes('consultant') && this.renderConsultantTable()}
        {showTables.includes('project') && this.renderProjectTable()}
      </Container>
    );
  }
}

export default ForecastReport;

const Container = styled.div`
  margin-top: 50px;
`;

const Title = styled.div`
  font-size: 18px;
  margin-left: 30px;
  margin-bottom: 30px;
`;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid #eee;
  line-height: 30px;
`;

const RowLabel = styled.div`
  flex: none;
  width: 240px;
`;

const Cell = styled.div`
  flex: 1;
`;
