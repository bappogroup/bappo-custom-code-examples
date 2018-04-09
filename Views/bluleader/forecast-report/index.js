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
} from 'utils';

const getTableKey = (x, y) => `${x}.${y}`;

const forecastElements = [
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

class ForecastReport extends React.Component {
  state = {
    elements: null,
    name: null,
    loading: false,
    consultants: this.props.consultants,
    externalConsultants: [],
    entries: {},
    totals: {},
  };

  async componentDidUpdate(prevProps) {
    const {
      $models,
      elementKey,
      financialYear,
      financialMonth,
      profitCentreIds,
      // from calculationBaseData:
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
      // Update selected forecast elements
      const elements = elementKey
        ? forecastElements.filter(e => e.key === elementKey)
        : forecastElements.slice();

      // Calculate report data, store in entries
      const entries = {};
      const externalConsultants = [];
      const promises = [];

      // Date range: 1 month
      const startDate = moment({
        year: calendarYear,
        month: calendarMonth - 1,
        day: 1,
      });
      const endDate = startDate.clone().add(1, 'month');

      for (const element of elements) {
        switch (element.key) {
          case 'CWAGES': {
            // Contractor wages
            const promise = getWageRosterEntries({
              $models,
              calendarYear,
              calendarMonth,
              consultants,
            }).then(wageRosterEntries => {
              wageRosterEntries.forEach(entry => {
                const key = getTableKey(entry.consultant.name, 'Contractor Wages');
                if (!entries[key]) entries[key] = 0;
                entries[key] += +entry.consultant.dailyRate;
              });
            });
            promises.push(promise);
            break;
          }
          case 'SAL': {
            // Consultant salaries
            const consultantSalaries = getConsultantSalariesByMonth({
              consultants,
              financialYear,
              financialMonth,
            });
            consultantSalaries.forEach(({ consultant, salary }) => {
              const key = getTableKey(consultant.name, 'Consultant Salaries');
              entries[key] = salary;
            });
            break;
          }
          case 'TMREV': {
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
                entries[key] = revenue;
              });
            });
            promises.push(promise);
            break;
          }
          case 'INTREV': {
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
                if (!entries[key]) entries[key] = 0;
                entries[key] -= +internalRate;
              });
            });
            promises.push(promise);
            break;
          }
          case 'INTCH': {
            // Internal Charge
            // const costCentersInPc = costCenters.filter(cc => cc.profitCentre_id === profitCentre_id)
            const promise = getInternalCharge({
              $models,
              consultants,
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
                if (!entries[key]) entries[key] = 0;
                entries[key] += +internalRate;
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
      const totals = {};
      elements.forEach(element => {
        let total = 0;
        consultants.concat(externalConsultants).forEach(({ name }) => {
          const key = getTableKey(name, element.name);
          if (entries[key]) total += entries[key];
        });
        totals[element.name] = total;
      });

      this.setState({
        loading: false,
        consultants,
        externalConsultants,
        entries,
        totals,
        elements,
        name: `Report of ${moment()
          .month(calendarMonth - 1)
          .format('MMM')}, ${calendarYear}`,
      });
    }
  }

  renderRow = consultant => (
    <Row>
      <RowLabel>{consultant.name}</RowLabel>
      {this.state.elements.map(element => {
        const key = getTableKey(consultant.name, element.name);
        return <Cell>{this.state.entries[key] || 0}</Cell>;
      })}
    </Row>
  );

  render() {
    const { loading, consultants, externalConsultants, name, totals, elements } = this.state;
    console.log(loading);
    // return 'Loading...';
    if (loading) return <ActivityIndicator />;
    if (!(name && elements && consultants && this.props.financialMonth && this.props.financialYear))
      return null;

    return (
      <Container>
        <Title>{name}</Title>
        <Row style={{ borderTop: 'none' }}>
          <RowLabel />
          {elements.map(element => <Cell>{element.name}</Cell>)}
        </Row>
        {consultants.map(this.renderRow)}
        {externalConsultants.length > 0 && (
          <Row style={{ borderTop: 'none' }}>External Consultants:</Row>
        )}
        {externalConsultants.map(this.renderRow)}
        <Row style={{ borderTop: '1px solid black' }}>
          <RowLabel>Total</RowLabel>
          {elements.map(element => <Cell>{totals[element.name] || 0}</Cell>)}
        </Row>
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
