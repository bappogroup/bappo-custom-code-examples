import moment from 'moment';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Button, ScrollView, Styles, Text, View } from 'bappo-components';
import {
  systemDateFormat,
  systemTimeFormat,
  displayTimeFormat,
  weekDays,
  hours,
} from './constants';
import Badge from './Badge';
import Navigator from './Navigator';

const HOUR_HEIGHT = 50;

const getWeekDateRage = (month) => {
  return [
    month.clone().startOf('week').format(systemDateFormat),
    month.clone().endOf('week').format(systemDateFormat),
  ];
};

const isWeekend = dayNum => dayNum === 0 || dayNum === 6;

const isWorkTime = hourNum => hourNum >= 8 && hourNum <= 18;

const getHoursFromMidnight = (time) => {
  const midnight = time.clone().startOf('day');
  return time.diff(midnight, 'hours', true);
};

const getAppointmentContainerStyle = (startTime, endTime) => {
  const startMoment = moment(startTime, systemTimeFormat);
  const endMoment = moment(endTime, systemTimeFormat);
  const midnight = startMoment.clone().startOf('day');
  return {
    top: HOUR_HEIGHT * (1 + getHoursFromMidnight(startMoment)),
    height: HOUR_HEIGHT * endMoment.diff(startMoment, 'hours', true),
  };
};

const getGridStyle = (day, hour) => {
  if (isWeekend(day) && isWorkTime(hour)) {
    return [styles.gridCell, styles.weekendCell, styles.weekendWorkTimeCell];
  } else if (isWeekend(day)) {
    return [styles.gridCell, styles.weekendCell];
  } else if (isWorkTime(hour)) {
    return [styles.gridCell, styles.workTimeCell];
  }
  return [styles.gridCell];
};

class WeekCalendar extends Component {
  static propTypes = {
    appointmentsByDate: PropTypes.object.isRequired,
    fetchAppointments: PropTypes.func.isRequired,
  };

  state = {
    selectedWeek: moment().startOf('week'),
  };

  componentDidMount() {
    this.props.fetchAppointments(getWeekDateRage(this.state.selectedWeek));
  }

  componentWillUpdate(nextProps, nextState) {
    if (nextState.selectedWeek !== this.state.selectedWeek) {
      nextProps.fetchAppointments(getWeekDateRage(nextState.selectedWeek));
    }
  }

  scrollToCurrentTime = (visibleHeight) => {
    const now = moment();
    if (this.scrollView && visibleHeight &&
      now.isBetween(...getWeekDateRage(this.state.selectedWeek))
    ) {
      const offset = HOUR_HEIGHT * (1 + getHoursFromMidnight(now)) - visibleHeight / 2;
      this.scrollView.setScrollTop(offset, false);
    }
  };

  renderHeader = () => {
    return (
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {this.state.selectedWeek.format('MMMM YYYY')}
        </Text>
        <Navigator
          onLeftPress={() => this.setState(prevState => ({
            selectedWeek: prevState.selectedWeek.clone().subtract(1, 'week'),
          }))}
          onMiddlePress={() => this.setState({
            selectedWeek: moment().startOf('week'),
          })}
          onRightPress={() => this.setState(prevState => ({
            selectedWeek: prevState.selectedWeek.clone().add(1, 'week'),
          }))}
        />
      </View>
    );
  };

  renderAppointment = (appointment) => {
    const { $navigation } = this.props;
    const containerStyle = getAppointmentContainerStyle(appointment.startTime, appointment.endTime);
    return (
      <Button
        key={appointment.id}
        onPress={() => $navigation.navigate('appointment-details', {
          recordId: appointment.id,
        })}
        style={[styles.appointmentContainer, containerStyle]}
      >
        {containerStyle.height > HOUR_HEIGHT && (
          <Text style={styles.appointmentStartTime}>
            {moment(appointment.startTime, systemTimeFormat).format(displayTimeFormat)}
          </Text>
        )}
        <Text
          numberOfLines={3}
          style={styles.appointmentSubject}
        >
          {appointment.name}
        </Text>
      </Button>
    );
  };

  renderCalendarHeader = () => {
    return (
      <View style={styles.weekHeader}>
        <View style={styles.leftCell} />
        {weekDays.map((weekDayNum) => {
          const weekDay = this.state.selectedWeek.clone().day(weekDayNum);
          const isToday = weekDay.isSame(moment(), 'day');
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
                {weekDay.format('ddd.')}
              </Text>
              <View style={styles.badgeContainer}>
                <Badge
                  color={isWeekend(weekDayNum) ? '#c3c3c3' : '#000'}
                  highlighted={isToday}
                  number={weekDay.date()}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  renderGrid = () => {
    return (
      <ScrollView
        onLayout={({ height }) => this.scrollToCurrentTime(height)}
        ref={(scrollView) => { this.scrollView = scrollView; }}
      >
        <View style={styles.gridContainer}>
          <View style={styles.leftBar}>
            {hours.map(hour => (
              <View
                key={hour}
                style={styles.leftBarCell}
              >
                <Text style={styles.leftBarText}>
                  {moment().hour(hour).format('HH:00')}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.rightContainer}>
            {weekDays.map((day) => {
              const dateStr = this.state.selectedWeek.clone().day(day).format(systemDateFormat);
              const appointmentsInDay = this.props.appointmentsByDate[dateStr];
              return (
                <View
                  key={day}
                  style={styles.gridCol}
                >
                  {hours.map(hour => (
                    <View
                      key={hour}
                      style={getGridStyle(day, hour)}
                    />
                  ))}
                  <View style={[...getGridStyle(day), styles.gridLastRowCell]} />
                  {!!appointmentsInDay &&
                    Object.values(appointmentsInDay).map(this.renderAppointment)}
                </View>
              );
            })}
          </View>
        </View>
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

export default WeekCalendar;

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
    borderBottomWidth: 1,
    minHeight: 30,
  }),
  weekHeaderCol: Styles.createViewStyle({
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  badgeContainer: Styles.createViewStyle({
    marginLeft: 5,
  }),
  weekDayName: Styles.createTextStyle({
  }),
  weekendDayName: Styles.createTextStyle({
    color: '#c3c3c3',
  }),
  gridContainer: Styles.createViewStyle({
    flexDirection: 'row',
  }),
  leftBar: Styles.createViewStyle({
    width: 50,
    paddingTop: 44,
  }),
  leftBarCell: Styles.createViewStyle({
    alignItems: 'center',
    height: HOUR_HEIGHT,
  }),
  leftBarText: Styles.createTextStyle({
    color: '#c0c0c0',
    fontSize: 12,
  }),
  gridCol: Styles.createViewStyle({
    flex: 1,
  }),
  gridCell: Styles.createViewStyle({
    flex: 0,
    borderRightColor: '#e6e5e6',
    borderBottomColor: '#f7f7f7',
    borderStyle: 'solid',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    height: HOUR_HEIGHT,
  }),
  gridLastRowCell: Styles.createViewStyle({
    borderBottomWidth: 0,
    height: 10,
  }),
  weekendCell: Styles.createViewStyle({
    backgroundColor: '#f5f5f5',
    borderBottomColor: '#ededed',
  }),
  workTimeCell: Styles.createViewStyle({
    borderBottomColor: '#e6e5e6',
  }),
  weekendWorkTimeCell: Styles.createViewStyle({
    borderBottomColor: '#e0e0e0',
  }),
  leftCell: Styles.createViewStyle({
    width: 50,
  }),
  rightContainer: Styles.createViewStyle({
    flex: 1,
    flexDirection: 'row',
  }),
  appointmentContainer: Styles.createButtonStyle({
    justifyContent: 'flex-start',
    position: 'absolute',
    width: '100%',
    backgroundColor: 'rgba(41, 83, 122, 0.25)',
    paddingHorizontal: 10,
    minHeight: 13,
  }),
  appointmentStartTime: Styles.createTextStyle({
    color: '#345194',
    fontSize: 13,
  }),
  appointmentSubject: Styles.createTextStyle({
    fontSize: 13,
    fontWeight: 'bold',
  }),
};
