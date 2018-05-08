import moment from 'moment';

export const fiscalOffset = -6;
const dateFormat = 'YYYY-MM-DD';

export const monthFinancialToCalendar = (financialMonth, offset = fiscalOffset) => {
  let calendarMonth = +financialMonth + offset;
  if (calendarMonth > 12) calendarMonth -= 12;
  else if (calendarMonth < 0) calendarMonth += 12;
  return calendarMonth;
};

export const monthCalendarToFinancial = (calendarMonth, offset = fiscalOffset) => {
  let financialMonth = +calendarMonth - offset;
  if (financialMonth > 12) financialMonth -= 12;
  else if (financialMonth < 0) financialMonth += 12;
  return financialMonth;
};

/**
 * Generate an array of month information
 *
 * @return {array} month array, containing financialMonth, calendarMonth and label of one year
 */
export const generateMonthArray = (offset = fiscalOffset) => {
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
 * Get financial time object
 *
 * @param {string || moment} date
 * @return {object} financial time object
 */
export const getFinancialTimeFromDate = (date = moment(), offset = fiscalOffset) => {
  const fDate = moment(date).add(offset, 'months');
  return {
    financialYear: fDate.year(),
    financialMonth: fDate.month() + 1,
  };
};

export const financialToMoment = ({ financialYear, financialMonth }, offset = fiscalOffset) => {
  return moment({
    year: financialYear,
    month: financialMonth - 1,
  }).add(-offset, 'months');
};

/**
 * Convert financial year and month to calendar
 * e.g. { financialYear: 2018, financialMonth: 1 } becomes { calendarYear: 2018, calendarMonth: 7 }
 *
 * @param {number} param1.financialYear - financial year
 * @param {number} param1.financialMonth - financial year
 * @param {number} offset - how many months between calendar and financial month
 * @return {object} calendar time object
 */
export const financialToCalendar = ({ financialYear, financialMonth }) => {
  const calendarDate = financialToMoment({ financialYear, financialMonth });

  return {
    calendarYear: calendarDate.year(),
    calendarMonth: calendarDate.month() + 1,
  };
};

export const financialToDate = ({ financialYear, financialMonth }) => {
  const calendarDate = financialToMoment({ financialYear, financialMonth });

  return calendarDate.format(dateFormat);
};

/**
 * Get financial time object
 *
 * @param {number} param1.calendarYear - financial year
 * @param {number} param1.calendarMonth - financial year
 * @param {number} offset - how many months between calendar and financial month
 * @return {object} financial time object
 */
export const calendarToFinancial = ({ calendarYear, calendarMonth }, offset = fiscalOffset) => {
  return getFinancialTimeFromDate(moment({ year: calendarYear, month: calendarMonth - 1 }), offset);
};
