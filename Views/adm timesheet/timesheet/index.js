import React from 'react';
import moment from 'moment';
import { styled, View, Text, Button } from 'bappo-components';
import { findOrCreateTimesheetByDate } from 'utils';
import TimesheetHeader from './TimesheetHeader';
import RowHeader from './RowHeader';
import TaskRows from './TaskRows';

class TableView extends React.Component {
  state = {
    timesheet: null,
    employee: null,
    error: null,
  };

  async componentWillMount() {
    const { $navigation, $models, $global } = this.props;
    const { recordId } = $navigation.state.params;
    const { currentUser } = $global;

    const employee = await $models.Employee.findOne({
      where: {
        user_id: currentUser.id,
      },
    });

    if (!employee) return this.setState({ error: 'Employee not found' });

    const timesheet = await $models.Timesheet.findById(recordId, {
      include: [{ as: 'employee' }, { as: 'week' }],
    });

    return this.setState({ timesheet, employee, week: timesheet.week });
  }

  changeWeek = async (gapToNow, date) => {
    const { $navigation, $models } = this.props;
    const { timesheet, employee, week } = this.state;

    const targetTimesheet = await findOrCreateTimesheetByDate(
      $models,
      employee.id,
      moment(date || week.startDate).add(gapToNow, 'week'),
    );

    // navigate to target week
    $navigation.navigate('MyTimesheetView', {
      recordId: targetTimesheet.id,
      templateTimesheetId: timesheet.id,
    });
  };

  render() {
    const { timesheet, employee, week, error } = this.state;
    if (error) return <Text style={{ margin: 20 }}>{error}</Text>;
    if (!timesheet) return null;

    return (
      <Container>
        <HomeButton onPress={() => this.props.$navigation.navigate('_Home')}>
          Home
        </HomeButton>
        <TimesheetHeader timesheet={timesheet} changeWeek={this.changeWeek} />
        <RowHeader week={week} />
        <TaskRows timesheet={timesheet} employee={employee} {...this.props} />
      </Container>
    );
  }
}

export default TableView;

const Container = styled(View)``;

const HomeButton = styled(Button)`
  margin-top: 15px;
  margin-left: 15px;
  color: gray;
`;
