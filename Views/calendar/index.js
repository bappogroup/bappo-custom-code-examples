import moment from 'moment';
import React, { Component } from 'react';
import { Button, Styles, Text, View } from 'bappo-components';
import { systemDateFormat } from './constants';
import Calendar from './Calendar';

class CalendarPage extends Component {
  state = {
    selectedCalendar: 'month',
    appointmentsByDate: {},
  };

  fetchAppointments = async (dateRange) => {
    const { Appointment } = this.props.$models;
    const appointments = await Appointment.findAll({
      where: {
        date: {
          $between: dateRange,
        },
      },
    });
    this.updateAppointments(appointments);
  };

  updateAppointments = (appointments) => {
    this.setState(prevState => ({
      appointmentsByDate: appointments.reduce((dict, appointment) => {
        const dateStr = moment(appointment.date).format(systemDateFormat);
        return {
          ...dict,
          [dateStr]: {
            ...(dict[dateStr] || {}),
            [appointment.id]: appointment,
          },
        };
      }, prevState.appointmentsByDate),
    }));
  };

  renderCalendarSwitch = () => {
    return (
      <View
        ignorePointerEvents
        style={styles.calendarSwitch}
      >
        <Button
          onPress={() => this.setState({ selectedCalendar: 'week' })}
          style={[
            styles.calendarSwitchButton,
            styles.calendarSwitchButtonFirst,
            this.state.selectedCalendar === 'week' && styles.selectedButton,
          ]}
        >
          <Text style={this.state.selectedCalendar === 'week' && styles.selectedButtonText}>
            Week
          </Text>
        </Button>
        <Button
          onPress={() => this.setState({ selectedCalendar: 'month' })}
          style={[
            styles.calendarSwitchButton,
            styles.calendarSwitchButtonLast,
            this.state.selectedCalendar === 'month' && styles.selectedButton,
          ]}
        >
          <Text style={this.state.selectedCalendar === 'month' && styles.selectedButtonText}>
            Month
          </Text>
        </Button>
      </View>
    );
  };

  render() {
    const { $navigation } = this.props;
    return (
      <View style={styles.page}>
        {this.renderCalendarSwitch()}
        <View style={styles.calendarContainer}>
          <Calendar
            {...this.props}
            appointmentsByDate={this.state.appointmentsByDate}
            fetchAppointments={this.fetchAppointments}
            mode={this.state.selectedCalendar}
          />
        </View>
        <Button
          onPress={() => $navigation.navigate('new-appointment')}
          style={styles.createButton}
        >
          <Text>Add Appointment</Text>
        </Button>
      </View>
    );
  }
}

export default CalendarPage;

const styles = {
  page: Styles.createViewStyle({
    flex: 1,
  }),
  calendarContainer: Styles.createViewStyle({
    flex: 1,
  }),
  createButton: Styles.createButtonStyle({
    alignItems: 'center',
    height: 50,
  }),
  calendarSwitch: Styles.createViewStyle({
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  }),
  calendarSwitchButton: Styles.createButtonStyle({
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderColor: '#000',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
  }),
  calendarSwitchButtonFirst: Styles.createButtonStyle({
    borderLeftWidth: 1,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  }),
  calendarSwitchButtonLast: Styles.createButtonStyle({
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  }),
  selectedButton: Styles.createButtonStyle({
    backgroundColor: '#5e5e5e',
  }),
  selectedButtonText: Styles.createTextStyle({
    color: '#fff',
  }),
};
