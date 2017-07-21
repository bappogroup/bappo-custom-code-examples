import React from 'react';
import MonthCalendar from './MonthCalendar';
import WeekCalendar from './WeekCalendar';

const Calendar = ({ mode, ...props }) => {
  switch (mode) {
    case 'month':
      return <MonthCalendar {...props} />;
    case 'week':
      return <WeekCalendar {...props} />;
    default:
      return null;
  }
};

export default Calendar;
