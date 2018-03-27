import moment from 'moment';

export const getMonday = (date = moment()) => moment(date).day(1);

export const daysDisplayed = 28;
export const dateFormat = 'DD-MM-YYYY';

export const datesToArray = (from, to) => {
  const list = [];
  let day = from.clone();

  do {
    list.push(day);
    day = day.clone().add(1, 'd');
  } while (day <= to);
  return list;
};

export const datesToArrayByStart = start => {
  const startDate = moment(start);
  return datesToArray(startDate, startDate.clone().add(daysDisplayed, 'd'));
};

export const datesEqual = (time1, time2) => {
  const moment1 = moment(time1);
  const moment2 = moment(time2);
  return moment1.format(dateFormat) === moment2.format(dateFormat);
};
