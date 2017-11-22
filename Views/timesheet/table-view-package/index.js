import React from 'react';
import moment from 'moment';
import { styled, View, Text } from 'bappo-components';
import TimesheetHeader from './TimesheetHeader';
import RowHeader from './RowHeader';
import JobRows from './JobRows';
import { getMonday } from './utils';

class TableView extends React.Component {
  state = {
    timesheet: null,
    consultant: null,
    error: null,
  }

  async componentDidMount() {
    const { $navigation, $models, $global } = this.props;
    const { recordId } = $navigation.state.params;
    const { currentUser } = $global;

    const consultant = await $models.Consultant.findOne({
      where: {
        user_id: currentUser.id
      }
    });

    if (!consultant) return this.setState({ error: 'Consultant not found' });

    const timesheet = (await $models.Timesheet.findAll({
      where: {
        id: recordId,
      },
      include: [
        { as: 'consultant' }
      ]
    }))[0];

    // Change day of a week to Monday if needed
    timesheet.week = getMonday(timesheet.week);

    this.setState({ timesheet, consultant });
  }

  changeWeek = async (gapToNow, date) => {
    const { $navigation, $models } = this.props;
    const { timesheet } = this.state;

    const targetWeek = date ?
      getMonday(date) :
      moment(getMonday(timesheet.week)).add(gapToNow, 'week').format('YYYY-MM-DD');

    let targetTimesheet;
    let templateTimesheetId;
    targetTimesheet = await $models.Timesheet.findOne({
      where: {
        week: targetWeek,
        consultant_id: timesheet.consultant_id,
      },
    });

    if (!targetTimesheet) {
      // create new time sheet
      targetTimesheet = await $models.Timesheet.create({
        week: targetWeek,
        consultant_id: timesheet.consultant_id,
      });
      templateTimesheetId = timesheet.id;
    }

    // navigate to target week
    $navigation.navigate(
      'TimesheetDetailsPage',
      {
        recordId: targetTimesheet.id,
        templateTimesheetId,
      }
    );
  }

  render() {
    const { timesheet, consultant, error } = this.state;
    if (!timesheet) return null;

    if (error) return <Text>{error}</Text>;

    return (
      <Container>
        <TimesheetHeader
          timesheet={timesheet}
          changeWeek={this.changeWeek}
        />
        <RowHeader startDate={timesheet.week} />
        <JobRows
          timesheet={timesheet}
          consultant={consultant}
          {...this.props}
        />
      </Container>
    );
  }
}

export default TableView;

const Container = styled(View)`
`;
