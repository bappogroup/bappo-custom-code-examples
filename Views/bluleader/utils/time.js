import moment from 'moment';

const fiscalOffset = 6;

const monthFinancialToCalendar = (financialMonth, offset = fiscalOffset) => {
  let calendarMonth = +financialMonth + offset;
  if (calendarMonth > 12) calendarMonth -= 12;
  return calendarMonth;
};

const monthCalendarToFinancial = (calendarMonth, offset = fiscalOffset) => {
  let financialMonth = +calendarMonth - offset;
  if (financialMonth < 0) financialMonth += 12;
  return financialMonth;
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
 * Get financial year
 *
 * @param {string || moment} date
 * @return {object} contains financialYear and financialMonth
 */
const getFinancialTimeFromDate = (date = moment()) => {
  let financialYear = moment(date).year();
  const quarter = moment(date).quarter();
  if (quarter === 1 || quarter === 2) financialYear -= 1;

  const calendarMonth = moment(date).month() + 1;
  const financialMonth = monthCalendarToFinancial(calendarMonth);

  return { financialYear, financialMonth };
};

/**
 * Convert financial year and month to calendar
 * e.g. { financialYear: 2018, financialMonth: 1 } becomes { calendarYear: 2018, calendarMonth: 7 }
 *
 * @param {number} param1.financialYear - financial year
 * @param {number} param1.financialMonth - financial year
 * @param {number} offset - how many months between calendar and financial month
 * @return {object} calendar object
 */
const financialToCalendar = ({ financialYear, financialMonth }, offset = fiscalOffset) => {
  const calendarMonth = monthFinancialToCalendar(+financialMonth);

  let calendarYear = +financialYear;
  if (financialMonth > offset) calendarYear += 1;

  return {
    calendarYear,
    calendarMonth,
  };
};

export default {
  fiscalOffset,
  financialToCalendar,
  getFinancialTimeFromDate,
  generateMonthArray,
  monthFinancialToCalendar,
  monthCalendarToFinancial,
};
