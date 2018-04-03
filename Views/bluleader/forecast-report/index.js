import React from 'react';
import moment from 'moment';
import { ActivityIndicator, styled } from 'bappo-components';
import utils from 'utils';

const {
  financialToCalendar,
  getWageRosterEntries,
  getConsultantSalariesByMonth,
} = utils;

class ForecastReport extends React.Component {
  state = {
    name: null,
    time: null,
    data: null,
    loading: false,
  };

  async componentDidUpdate(prevProps) {
    const {
      elementKey,
      $models,
      financialYear,
      financialMonth,
      profitCentreIds,
    } = this.props;

    // this.setState({ loading: true });

    if (
      prevProps.financialMonth !== this.props.financialMonth ||
      prevProps.elementKey !== this.props.elementKey ||
      prevProps.financialMonth !== this.props.financialMonth
    ) {
      // Calculate report data
      switch (elementKey) {
        case 'CWAGES': {
          // Contractor wages
          const wageEntries = await getWageRosterEntries({
            $models,
            financialTime: {
              financialYear,
              financialMonth,
            },
            profitCentreIds,
          });

          const { calendarYear, calendarMonth } = financialToCalendar({
            financialYear,
            financialMonth,
          });

          const wageByConsultant = {};

          wageEntries.forEach(e => {
            if (!wageByConsultant[e.consultant.name]) {
              wageByConsultant[e.consultant.name] = +e.consultant.dailyRate;
            } else
              wageByConsultant[e.consultant.name] += +e.consultant.dailyRate;
          });

          const data = Object.entries(wageByConsultant).map(
            ([consultantName, wage]) => ({
              key: consultantName,
              value: wage,
            }),
          );

          this.setState({
            name: 'Contractor Wages',
            time: `${moment()
              .month(calendarMonth - 1)
              .format('MMM')} ${calendarYear}`,
            data,
          });
          break;
        }

        case 'SAL': {
          // Consultant salaries
          // Find all related cost centers, for later use
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
          const consultantSalaries = await getConsultantSalariesByMonth({
            consultants,
            financialYear,
            financialMonth,
          });
          const { calendarYear, calendarMonth } = financialToCalendar({
            financialYear,
            financialMonth,
          });

          const data = consultantSalaries.map(cs => ({
            key: cs.consultant.name,
            value: cs.salary,
          }));
          this.setState({
            name: 'Consultant Salaries',
            time: `${moment()
              .month(calendarMonth - 1)
              .format('MMM')} ${calendarYear}`,
            data,
          });
          break;
        }
        default:
      }
    }

    // this.setState(state => ({
    //   ...state,
    //   loading: false,
    // }));
  }

  renderRow = ({ key, value }) => (
    <Row>
      <RowLabel>{key}</RowLabel>
      <Cell>{value}</Cell>
    </Row>
  );

  render() {
    const { loading, name, time, data } = this.state;
    if (loading) return <ActivityIndicator />;
    if (!(name && time && data)) return null;

    let total = 0;
    data.forEach(({ value }) => {
      if (value) total += +value;
    });

    return (
      <Container>
        <Title>
          {name} Report, {time}
        </Title>
        {data.map(this.renderRow)}
        <Row style={{ borderTop: '1px solid black' }}>
          <RowLabel>Total</RowLabel>
          <Cell>{total}</Cell>
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
