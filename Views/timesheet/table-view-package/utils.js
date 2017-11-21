import moment from 'moment';

// Get the Monday of given date's week
// param and return are all plain string
export const getMonday = (date) => {
  let givenDate = moment(date);
  if (givenDate.day() === 1) return date;
  return givenDate.day(1).format('YYYY-MM-DD');
}
