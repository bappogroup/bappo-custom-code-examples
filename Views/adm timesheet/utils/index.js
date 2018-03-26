import moment from 'moment';

export const dateFormat = 'YYYY-MM-DD';

/**
 * Get week object of given date
 * including week name, start date and end date
 *
 * @param {string || moment} date - target date
 * @return {object} week object
 */
export const getWeek = (date = moment()) => {
  const sunday = moment(date).day(0);
  const saturday = moment(date).day(6);
  const weekName = `${saturday.year()}W${saturday.week()}`;

  return {
    name: weekName,
    startDate: sunday.format(dateFormat),
    endDate: saturday.format(dateFormat),
  };
};

/**
 * Find or create a timesheet by given date
 * also create related week if needed
 * return the target timesheet
 *
 * @param {object} $models
 * @param {string} employee_id - current employee id
 * @param {string || moment} date - optional
 * @return {object} timesheet object
 */
export const findOrCreateTimesheetByDate = async (
  $models,
  employee_id,
  date = moment(),
) => {
  const { name, startDate, endDate } = getWeek(date);

  let targetWeek;
  targetWeek = await $models.Week.findOne({
    where: {
      startDate,
    },
  });

  if (!targetWeek) {
    // Create current week if not found
    targetWeek = await $models.Week.create({
      name,
      startDate,
      endDate,
    });
  }

  let targetTimesheet;
  targetTimesheet = await $models.Timesheet.findOne({
    where: {
      week_id: targetWeek.id,
      employee_id,
    },
  });

  if (!targetTimesheet) {
    // Create timesheet if not found
    targetTimesheet = await $models.Timesheet.create({
      week_id: targetWeek.id,
      employee_id,
    });
  }

  return targetTimesheet;
};

export const timesheetEntryFormConfig = {
  objectKey: 'TimesheetEntry',
  fields: ['hours', 'notes'],
};
