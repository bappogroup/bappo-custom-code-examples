import React from 'react';
import moment from 'moment';
import utils from 'utils';
import { ActivityIndicator, styled } from 'bappo-components';

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
];

const {
  financialToCalendar,
  getWageRosterEntries,
  getServiceRevenueRosterEntries,
  getConsultantSalariesByMonth,
} = utils;

class ForecastReport extends React.Component {
  state = {
    elements: null,
    name: null,
    loading: false,
    consultants: null,
    entries: {},
    totals: {},
  };

  async componentDidMount() {
    // Find all related consultants
    const { $models, profitCentreIds } = this.props;
    const costCenters = await $models.CostCenter.findAll({
      where: {
        profitCentre_id: {
          $in: profitCentreIds,
        },
      },
    });
    const consultants = await $models.Consultant.findAll({
      where: {
        costCenter_id: {
          $in: costCenters.map(cc => cc.id),
        },
      },
    });
    this.setState({ consultants });
  }

  async componentDidUpdate(prevProps) {
    const {
      $models,
      elementKey,
      financialYear,
      financialMonth,
      profitCentreIds,
    } = this.props;
    const { consultants } = this.state;
    const { calendarYear, calendarMonth } = financialToCalendar({
      financialYear,
      financialMonth,
    });

    if (!consultants) return;

    if (
      prevProps.elementKey !== this.props.elementKey ||
      prevProps.financialYear !== this.props.financialYear ||
      prevProps.financialMonth !== this.props.financialMonth
    ) {
      // Update selected forecast elements
      const elements = elementKey
        ? forecastElements.filter(e => e.key === elementKey)
        : forecastElements.slice();

      // Calculate report data, store in entries
      const entries = {};
      const promises = [];

      for (const element of elements) {
        switch (element.key) {
          case 'CWAGES': {
            // Contractor wages
            const promise = getWageRosterEntries({
              $models,
              calendarYear,
              calendarMonth,
              profitCentreIds,
            }).then(wageRosterEntries => {
              wageRosterEntries.forEach(entry => {
                const key = getTableKey(
                  entry.consultant.name,
                  'Contractor Wages',
                );
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
              profitCentreIds,
              consultantIds: consultants.map(c => c.id),
            }).then(revenues => {
              Object.entries(revenues).forEach(([consultantName, revenue]) => {
                const key = getTableKey(consultantName, 'Service Revenue');
                entries[key] = revenue;
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
        consultants.forEach(({ name }) => {
          const key = getTableKey(name, element.name);
          if (entries[key]) total += entries[key];
        });
        totals[element.name] = total;
      });

      this.setState({
        entries,
        totals,
        elements,
        name: `Report of ${moment()
          .month(calendarMonth - 1)
          .format('MMM')}, ${calendarYear}`,
      });
    }
  }

  renderRow = consultant => {
    return (
      <Row>
        <RowLabel>{consultant.name}</RowLabel>
        {this.state.elements.map(element => {
          const key = getTableKey(consultant.name, element.name);
          return <Cell>{this.state.entries[key] || 0}</Cell>;
        })}
      </Row>
    );
  };

  render() {
    const { consultants, name, totals, elements } = this.state;
    if (!(name && elements)) return null;

    return (
      <Container>
        <Title>{name}</Title>
        <Row>
          <RowLabel />
          {elements.map(element => <Cell>{element.name}</Cell>)}
        </Row>
        {consultants.map(this.renderRow)}
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
