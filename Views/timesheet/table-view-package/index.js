import React from 'react';
import moment from 'moment';
import { styled, View } from 'bappo-components';
import TimesheetHeader from './TimesheetHeader';
import RowHeader from './RowHeader';
import JobRows from './JobRows';
import { getMonday } from './utils';

class TableView extends React.Component {
  state = {
    timesheet: null,
  }

  async componentDidMount() {
    const { $navigation, $models } = this.props;
    const { recordId } = $navigation.state.params;
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

    this.setState({ timesheet });
  }

  switchWeek = async (isNext) => {
    const { $navigation, $models } = this.props;
    const { timesheet } = this.state;

    const weekGap = isNext ? 1 : -1;
    const targetWeek = moment(getMonday(timesheet.week)).add(weekGap, 'week').format('YYYY-MM-DD');

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
    const { timesheet } = this.state;
    if (!timesheet) return null;

    return (
      <Container>
        <TimesheetHeader
          timesheet={timesheet}
          switchWeek={this.switchWeek}
        />
        <RowHeader startDate={timesheet.week} />
        <JobRows
          timesheet={timesheet}
          {...this.props}
        />
      </Container>
    );
  }
}

export default TableView;

const Container = styled(View)`
`;
