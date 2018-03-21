import moment from 'moment';

const fiscalOffset = 6;

const monthFinancialToCalendar = (financialMonth, offset = fiscalOffset) => {
  let calendarMonth = financialMonth + offset;
  if (calendarMonth > 12) calendarMonth -= 12;
  return calendarMonth;
};

/**
 * Generate an array of month information
 *
 * @return {array} month array, containing financialMonth, calendarMonth and label of one year
 */
const generateMonthArray = (offset = fiscalOffset) => {
  const dict = [];
  for (let i = 1; i < 13; i++) {
    const calendarMonth = monthFinancialToCalendar(i, offset);
    dict.push({
      financialMonth: i,
      calendarMonth,
      label: moment()
        .month(calendarMonth - 1)
        .format('MMM'),
    });
  }
  return dict;
};

/**
 * Get current financial year
 *
 * @return {string} year
 */
const getCurrentFinancialYear = () => {
  const quarter = moment().quarter();

  if (quarter === 1 || quarter === 2) return moment().year();
  return moment().year() + 1;
};

/**
 * Convert financial year and month to calendar
 * e.g. { financialYear: 2018, financialMonth: 1 } becomes { calendarYear: 2018, calendarMonth: 7 }
 *
 * @param {string} param1.financialYear - financial year
 * @param {string} param1.financialMonth - financial year
 * @param {string} offset - how many months between calendar and financial month
 * @return {object} calendar object
 */
const financialToCalendar = (
  { financialYear, financialMonth },
  offset = fiscalOffset,
) => {
  const calendarMonth = monthFinancialToCalendar(financialMonth);

  let calendarYear = financialYear;
  if (financialMonth > offset) calendarYear += 1;

  return {
    calendarYear,
    calendarMonth,
  };
};

export default {
  fiscalOffset,
  financialToCalendar,
  getCurrentFinancialYear,
  generateMonthArray,
};
