import moment from 'moment';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Button, ScrollView, Styles, Text, View } from 'bappo-components';
import { systemDateFormat, systemTimeFormat, displayTimeFormat, weekDays } from './constants';
import Badge from './Badge';
import Navigator from './Navigator';

const WEEK_HEIGHT = 80;

const getMonthDateRage = (month) => {
  return [
    month.clone().startOf('month').startOf('week').format(systemDateFormat),
    month.clone().endOf('month').endOf('week').format(systemDateFormat),
  ];
};
const getMonthDates = (month) => {
  const start = month.clone().startOf('month').startOf('week');
  const end = month.clone().endOf('month').endOf('week');
  const arr = [];
  while (start.isSameOrBefore(end)) {
    arr.push(start.clone());
    start.add(1, 'day');
  }
  return arr;
};

const getWeeksFromStartOfCalendar = (time) => {
  const startOfCalendar = time.clone().startOf('month').startOf('week');
  return time.diff(startOfCalendar, 'weeks');
};

const isWeekDay = date => date.day() >= 1 && date.day() <= 5;

const splitIntoWeeks = dates => dates
  .map((date, i) => i % 7 === 0 && dates.slice(i, i + 7))
  .filter(Boolean);

class MonthCalendar extends Component {
  static propTypes = {
    appointmentsByDate: PropTypes.object.isRequired,
    fetchAppointments: PropTypes.func.isRequired,
  };

  state = {
    selectedMonth: moment().startOf('month'),
  };

  componentDidMount() {
    this.props.fetchAppointments(getMonthDateRage(this.state.selectedMonth));
  }

  componentWillUpdate(nextProps, nextState) {
    if (nextState.selectedMonth !== this.state.selectedMonth) {
      nextProps.fetchAppointments(getMonthDateRage(nextState.selectedMonth));
    }
  }

  scrollToToday = (visibleHeight) => {
    const now = moment();
    if (this.scrollView && visibleHeight &&
      now.isBetween(...getMonthDateRage(this.state.selectedMonth))
    ) {
      const offset = WEEK_HEIGHT * (0.5 + getWeeksFromStartOfCalendar(now)) - visibleHeight / 2;
      this.scrollView.setScrollTop(offset, false);
    }
  };

  renderHeader = () => {
    return (
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {this.state.selectedMonth.format('MMMM YYYY')}
        </Text>
        <Navigator
          onLeftPress={() => this.setState(prevState => ({
            selectedMonth: prevState.selectedMonth.clone().subtract(1, 'month'),
          }))}
          onMiddlePress={() => this.setState({
            selectedMonth: moment().startOf('month'),
          })}
          onRightPress={() => this.setState(prevState => ({
            selectedMonth: prevState.selectedMonth.clone().add(1, 'month'),
          }))}
        />
      </View>
    );
  };

  renderAppointment = (appointment) => {
    const { $navigation } = this.props;
    const startTime = moment(appointment.startTime, systemTimeFormat).format(displayTimeFormat);
    return (
      <Button
        key={appointment.id}
        onPress={() => $navigation.navigate('appointment-details', {
          recordId: appointment.id,
        })}
      >
        <Text
          numberOfLines={1}
          style={styles.appointmentSubject}
        >
          {`${appointment.name} (${startTime})`}
        </Text>
      </Button>
    );
  };

  renderCalendarHeader = () => {
    return (
      <View style={styles.weekHeader}>
        {weekDays.map((weekDayNum) => {
          return (
            <View
              key={weekDayNum}
              style={styles.weekHeaderCol}
            >
              <Text
                style={[
                  styles.weekDayName,
                  (weekDayNum === 0 || weekDayNum === 6) && styles.weekendDayName,
                ]}
              >
                {moment().day(weekDayNum).format('ddd.')}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  renderWeek = (weekDays, weekNum) => {
    const selectedMonthStr = this.state.selectedMonth.format(systemDateFormat);
    return (
      <View
        key={weekNum}
        style={styles.weekBox}
      >
        {weekDays.map((weekDay, weekDayNum) => {
          const weekDayStr = weekDay.format(systemDateFormat);
          const appointmentsInDay = this.props.appointmentsByDate[weekDayStr];
          let dayColor = '#000';
          if (!weekDay.isSame(this.state.selectedMonth, 'month')) {
            dayColor = '#c3c3c3';
          } else if (!isWeekDay(weekDay)) {
            dayColor = '#878787';
          }
          return (
            <View
              key={weekDayNum}
              style={[styles.dayBox, !isWeekDay(weekDay) && styles.weekendBox]}
            >
              <View style={styles.badgeContainer}>
                <Badge
                  color={dayColor}
                  highlighted={weekDay.isSame(moment(), 'day')}
                  number={weekDay.date()}
                />
              </View>
              {!!appointmentsInDay && Object.values(appointmentsInDay).map(this.renderAppointment)}
            </View>
          );
        })}
      </View>
    );
  };

  renderGrid = () => {
    const weeks = splitIntoWeeks(getMonthDates(this.state.selectedMonth));
    return (
      <ScrollView
        onLayout={({ height }) => this.scrollToToday(height)}
        ref={(scrollView) => { this.scrollView = scrollView; }}
      >
        {weeks.map(this.renderWeek)}
      </ScrollView>
    );
  };

  render() {
    return (
      <View style={styles.container}>
        {this.renderHeader()}
        {this.renderCalendarHeader()}
        {this.renderGrid()}
      </View>
    );
  }
}

export default MonthCalendar;

const styles = {
  container: Styles.createViewStyle({
    flex: 1,
  }),
  header: Styles.createViewStyle({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    paddingHorizontal: 20,
  }),
  headerText: Styles.createTextStyle({
    fontSize: 24,
  }),
  weekHeader: Styles.createViewStyle({
    flexDirection: 'row',
    borderColor: '#e6e5e6',
    borderStyle: 'solid',
    borderBottomWidth: 2,
    height: 30,
  }),
  weekHeaderCol: Styles.createViewStyle({
    flex: 1,
    alignItems: 'center',
  }),
  weekDayName: Styles.createTextStyle({
  }),
  weekendDayName: Styles.createTextStyle({
    color: '#c3c3c3',
  }),
  weekBox: Styles.createViewStyle({
    flexDirection: 'row',
    borderColor: '#e6e5e6',
    borderStyle: 'solid',
    borderBottomWidth: 1,
  }),
  dayBox: Styles.createViewStyle({
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    height: WEEK_HEIGHT,
    overflow: 'hidden',
    borderColor: '#e6e5e6',
    borderStyle: 'solid',
    borderRightWidth: 1,
  }),
  weekendBox: Styles.createViewStyle({
    backgroundColor: '#f5f5f5',
  }),
  badgeContainer: Styles.createViewStyle({
    alignItems: 'flex-end',
  }),
  appointmentSubject: Styles.createTextStyle({
    fontSize: 13,
  }),
};
