import moment from 'moment';

// Get current financial year
export const getCurrentFinancialYear = () => {
  const quarter = moment().quarter();

  if (quarter === 1 || quarter === 2) return moment().year();
  return moment().year() + 1;
};
