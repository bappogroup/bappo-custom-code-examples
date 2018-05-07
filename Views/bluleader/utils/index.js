import moment from 'moment';
import _ from 'lodash';
import * as time from './time';

export * from './time';
export * from './rosterTime';

export const dateFormat = 'YYYY-MM-DD';

// Probabilities that make a project billable
const billableProbabilities = ['50%', '90%', '100%'];

/**
 * Generate a unique key for a forecast entry in a table.
 *
 * @param {string} date - a date that moment can parse, e.g. '2018-03-03'
 * @param {string} rowIdentifier - a string identifying a row in the table
 * @return {string} entry key
 */
export const getForecastEntryKeyByDate = (date, rowIdentifier) => {
  const calendarYear = moment(date).year();
  const calendarMonth = moment(date).month() + 1;
  return `${calendarYear}.${calendarMonth}.${rowIdentifier}`;
};

/**
 * Generate a unique key for a forecast entry in a table.
 *
 * @param {string} year - calendar year
 * @param {string} month - calendar month
 * @param {string} rowIdentifier - a string identifying a row in the table
 * @param {bool} shouldConvertToCalendar - should year and month passed be converted to calendar
 * @return {string} entry key
 */
export const getForecastEntryKey = (
  year,
  month,
  rowIdentifier,
  shouldConvertToCalendar = false,
) => {
  if (!shouldConvertToCalendar) return `${year}.${month}.${rowIdentifier}`;

  const { calendarYear, calendarMonth } = time.financialToCalendar({
    financialYear: year,
    financialMonth: month,
  });

  return `${calendarYear}.${calendarMonth}.${rowIdentifier}`;
};

/**
 * Determine whether a roster entry incurs contractor wage
 * Conditions are:
 * 1. prob >= 50%
 * 2. project type === 2 ('T&M')
 * 3. consultant type === 2 ('Contractor')
 *
 * @param {object} roster entry
 * @return {boolean}
 */
const rosterEntryIncursContractorWages = rosterEntry => {
  const probability = _.get(rosterEntry, 'probability.name');
  if (
    _.get(rosterEntry, 'consultant.consultantType') === '2' &&
    _.get(rosterEntry, 'project.projectType') === '2' &&
    billableProbabilities.includes(probability)
  ) {
    return true;
  }
  return false;
};

/**
 * Get roster entries that incurs contractor wages of a given month
 *
 * @return {array} roster entry array
 */
export const getWageRosterEntries = async ({
  $models,
  calendarYear,
  calendarMonth,
  consultants,
}) => {
  if (!(calendarYear && calendarMonth)) return [];

  // Fetch roster entries of given month
  const startDate = moment({
    year: calendarYear,
    month: calendarMonth - 1,
    day: 1,
  });
  const endDate = startDate.clone().add(1, 'month');

  const rosterEntries = await $models.RosterEntry.findAll({
    where: {
      date: {
        $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
      },
      consultant_id: {
        $in: consultants.map(c => c.id),
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Get contractor wages entries
  const wageEntries = [];
  for (const rosterEntry of rosterEntries) {
    // Contractor Wages
    if (rosterEntryIncursContractorWages(rosterEntry)) {
      wageEntries.push(rosterEntry);
    }
  }

  return wageEntries;
};

/**
 * Calculate service revenues of a given month
 *
 * @return {object} consultantName-revenue pairs
 */
export const getServiceRevenueRosterEntries = async ({
  $models,
  calendarYear,
  calendarMonth,
  projects,
  projectAssignmentLookup,
}) => {
  if (!(calendarYear && calendarMonth)) return [];

  // Fetch roster entries of given month
  const startDate = moment({
    year: calendarYear,
    month: calendarMonth - 1,
    day: 1,
  });

  const rosterEntries = await $models.RosterEntry.findAll({
    where: {
      date: {
        $between: [
          startDate.format(dateFormat),
          startDate
            .clone()
            .add(1, 'month')
            .format(dateFormat),
        ],
      },
      project_id: {
        $in: projects.map(pj => pj.id),
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  const consultantServiceRevenues = {};
  for (const rosterEntry of rosterEntries) {
    const projectAssigment =
      projectAssignmentLookup[`${rosterEntry.consultant_id}.${rosterEntry.project_id}`];
    const revenue = +(projectAssigment && projectAssigment.dayRate) || 0;

    if (!consultantServiceRevenues[rosterEntry.consultant.name]) {
      consultantServiceRevenues[rosterEntry.consultant.name] = 0;
    }
    consultantServiceRevenues[rosterEntry.consultant.name] += revenue;
  }

  return consultantServiceRevenues;
};

/**
 * Calculate permanent consultant salaries of a given month
 *
 * @param {array} consultants within the costCenters
 * @param {array} financialYear
 * @param {array} financialMonth
 * @return {array} array of object containing consultant and salary
 */
export const getConsultantSalariesByMonth = ({ consultants, financialYear, financialMonth }) => {
  const consultantSalaries = [];

  for (const consultant of consultants) {
    // Exclude contractors
    if (consultant.consultantType !== '2') {
      const monthlySalary = consultant.annualSalary ? +consultant.annualSalary / 12 : 0;

      // Convert financial to calendar
      const { calendarYear, calendarMonth } = time.financialToCalendar({
        financialYear,
        financialMonth,
      });
      const prefixedMonth = `0${calendarMonth}`.slice(-2);
      const calendarDate = `${calendarYear}-${prefixedMonth}-01`;

      // Calculate partial monthly salary: how many days of this month is with in consultant's start/end date
      // Consultant start date is required, while end date is optional
      let validDays = 0;
      const totalDays = moment(calendarDate).daysInMonth();
      const monthStart = moment(calendarDate).startOf('month');
      const monthEnd = moment(calendarDate).endOf('month');
      const consultantStart = moment(consultant.startDate);
      const consultantEnd = consultant.endDate && moment(consultant.endDate);

      for (let m = monthStart; m.isBefore(monthEnd); m.add(1, 'days')) {
        if (consultantEnd) {
          if (m.isSameOrAfter(consultantStart) && m.isSameOrBefore(consultantEnd)) {
            validDays++;
          }
        } else if (m.isSameOrAfter(consultantStart)) {
          validDays++;
        }
      }

      const salary = (monthlySalary * (validDays / totalDays)).toFixed(2);

      if (salary > 0) {
        consultantSalaries.push({
          consultant,
          salary,
        });
      }
    }
  }

  return consultantSalaries;
};

/**
 * Calculate permanent consultant bonuses of a given month
 *
 * @return {array} array of object containing consultant and bonuses
 */
export const getConsultantBonusesByMonth = ({ consultants }) => {
  const consultantBonuses = [];

  for (const consultant of consultants) {
    if (consultant.consultantType === '1' && +consultant.bonusProvision !== 0) {
      consultantBonuses.push({
        consultant,
        bonus: (+consultant.bonusProvision / 12).toFixed(2),
      });
    }
  }

  return consultantBonuses;
};

/**
 * Get internal revenues within given time range
 * Internal Revenue: negative cost, when consultants belong to this profit centre works on external projects
 *
 * @param {array of object} internalRevenues array containing rosterEntry, consultant and internalRate
 */
export const getInternalRevenue = async ({
  $models,
  consultants,
  startDate,
  endDate,
  profitCentreIds,
  projectAssignmentLookup,
}) => {
  const internalRevenues = [];
  const consultantIds = consultants.map(c => c.id);

  let consultantRosterEntries = [];
  if (consultantIds.length > 0) {
    consultantRosterEntries = await $models.RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
        },
        consultant_id: {
          $in: consultantIds,
        },
      },
      include: [{ as: 'project' }, { as: 'consultant' }],
      limit: 10000,
    });
  }

  const externalRevenueEntries = consultantRosterEntries.filter(
    ce => profitCentreIds.indexOf(ce.project.profitCentre_id) === -1,
  );

  externalRevenueEntries.forEach(ee => {
    // Get internalRate: from projectAssignment or consultant
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = consultants.find(c => c.id === ee.consultant_id);
      ({ internalRate } = consultant);
    }

    internalRevenues.push({
      rosterEntry: ee,
      consultant: ee.consultant,
      internalRate,
    });
  });

  return internalRevenues;
};

/**
 * Get internal charges within given time range
 * Internal Charge: postive cost, when external consultants work on projects belong to this profit centre
 *
 * @param {array of object} internalCharges array containing rosterEntry, consultant and internalRate
 */
export const getInternalCharge = async ({
  $models,
  allConsultants,
  costCenters,
  startDate,
  endDate,
  projects,
  projectAssignmentLookup,
}) => {
  const costCenterIds = costCenters.map(cc => cc.id);

  const internalCharges = [];
  const projectIds = projects.map(c => c.id);
  let projectRosterEntries = [];
  if (projectIds.length > 0) {
    projectRosterEntries = await $models.RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
        },
        project_id: {
          $in: projectIds,
        },
      },
      include: [{ as: 'project' }, { as: 'consultant' }],
      limit: 10000,
    });
  }

  const externalCostEntries = projectRosterEntries.filter(
    pe => costCenterIds.indexOf(pe.consultant.costCenter_id) === -1,
  );

  externalCostEntries.forEach(ee => {
    // Get internalRate: from projectAssignment or consultant
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = allConsultants.find(c => c.id === ee.consultant_id);
      ({ internalRate } = consultant);
    }

    internalCharges.push({
      rosterEntry: ee,
      consultant: ee.consultant,
      internalRate,
    });
  });

  return internalCharges;
};

/**
 * Get details of fixed price project revenue of a month
 * Source: fixed price project forecast entries
 *
 * @param {object} $models
 * @param {string} financialYear
 * @param {string} financialMonth
 * @param {array of object} projects
 * @return {object} project revenue, containing projectName - revenue pairs
 */
export const getFixPriceRevenues = async ({ $models, projects, financialYear, financialMonth }) => {
  const projectRevenues = {};
  const projectForecastEntries = await $models.ProjectForecastEntry.findAll({
    where: {
      forecastType: '2', // 'Revenue'
      financialYear: financialYear.toString(),
      financialMonth: financialMonth.toString(),
      project_id: {
        $in: projects.map(p => p.id),
      },
    },
    include: [{ as: 'project' }],
    limit: 1000,
  });

  projectForecastEntries.forEach(e => {
    const { name } = e.project;
    if (!projectRevenues[name]) projectRevenues[name] = 0;
    projectRevenues[name] += +e.amount;
  });

  return projectRevenues;
};

/**
 * Calculate and update 'Service Revenue' row in a financial year, of a profit centre, by:
 * accumulating revenue gained from roster entries. Revenue comes from ProjectAssignment.dayRate
 */
const calculateServiceRevenue = async ({
  $models,
  financialYear,
  forecastElements,
  profitCentre_id,
  projectAssignmentLookup,
  projects,
}) => {
  const { RosterEntry, ForecastEntry } = $models;
  const forecastEntries = {};
  const serviceRevenueElementId = forecastElements.find(e => e.key === 'TMREV').id;

  if (!(projects.length && serviceRevenueElementId)) return;

  const projectIds = projects.map(p => p.id);

  const startDate = moment({
    year: financialYear,
    month: 6,
    day: 1,
  });
  const endDate = startDate.clone().add(1, 'year');

  const rosterEntriesByProjects = await RosterEntry.findAll({
    where: {
      date: {
        $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
      },
      project_id: {
        $in: projectIds,
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Calculate service revenues
  for (const rosterEntry of rosterEntriesByProjects) {
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);

    // This project assignment must exist!
    const { dayRate } = projectAssignmentLookup[
      `${rosterEntry.consultant_id}.${rosterEntry.project_id}`
    ];

    const serviceRevenueKey = getForecastEntryKey(
      financialYear,
      financialMonth,
      serviceRevenueElementId,
      true,
    );

    if (!forecastEntries[serviceRevenueKey]) {
      forecastEntries[serviceRevenueKey] = {
        financialYear,
        financialMonth,
        profitCentre_id,
        forecastElement_id: serviceRevenueElementId,
        amount: 0,
      };
    }
    forecastEntries[serviceRevenueKey].amount += +dayRate;
  }

  // Remove previous forecast entries and create new
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: serviceRevenueElementId,
      profitCentre_id,
    },
  });
  await ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

/**
 * Calculate and update 'Contractor Wages' row in a financial year, of a profit centre, by:
 * accumulating consultant daily rates from roster entries that incur contractor wages
 */
const calculateContractorWages = async ({
  $models,
  financialYear,
  forecastElements,
  profitCentre_id,
  consultants,
}) => {
  const { RosterEntry, ForecastEntry } = $models;
  const forecastEntries = {};
  const contractorWagesElementId = forecastElements.find(e => e.key === 'CWAGES').id;

  if (!(consultants.length && contractorWagesElementId)) return;

  const consultantIds = consultants.map(c => c.id);

  const startDate = moment({
    year: financialYear,
    month: 6,
    day: 1,
  });
  const endDate = startDate.clone().add(1, 'year');

  const rosterEntriesByConsultants = await RosterEntry.findAll({
    where: {
      date: {
        $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
      },
      consultant_id: {
        $in: consultantIds,
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Calculate contractor wages
  for (const rosterEntry of rosterEntriesByConsultants) {
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);

    if (rosterEntryIncursContractorWages(rosterEntry)) {
      const { dailyRate } = rosterEntry.consultant;

      const contractorWagesKey = getForecastEntryKey(
        financialYear,
        financialMonth,
        contractorWagesElementId,
        true,
      );

      if (!forecastEntries[contractorWagesKey]) {
        forecastEntries[contractorWagesKey] = {
          financialYear,
          financialMonth,
          profitCentre_id,
          forecastElement_id: contractorWagesElementId,
          amount: 0,
        };
      }
      forecastEntries[contractorWagesKey].amount += +dailyRate;
    }
  }

  // Remove previous forecast entries and create new
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: contractorWagesElementId,
      profitCentre_id,
    },
  });
  await ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

/**
 * Calculate permanent consultant salaries in a financial year
 * Update forecast entries
 */
const calculateConsultantSalaries = async ({
  $models,
  financialYear,
  forecastElements,
  profitCentre_id,
  consultants,
}) => {
  const salaryElementId = forecastElements.find(e => e.key === 'SAL').id;
  const forecastEntries = {};

  // Calculate forecast entries by adding up monthly salaris by cost centers
  for (let i = 1; i < 13; i++) {
    const consultantSalaries = getConsultantSalariesByMonth({
      consultants,
      financialYear,
      financialMonth: i,
    });

    const key = getForecastEntryKey(financialYear, i, salaryElementId, true);

    consultantSalaries.forEach(cs => {
      if (!forecastEntries[key]) {
        forecastEntries[key] = {
          financialYear,
          financialMonth: i,
          forecastElement_id: salaryElementId,
          profitCentre_id,
          amount: 0,
        };
      }
      forecastEntries[key].amount += +cs.salary;
    });
  }

  // Remove previous forecast entries and create new
  await $models.ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: salaryElementId,
      profitCentre_id,
    },
  });

  const newEntries = Object.values(forecastEntries);
  if (newEntries.length > 0) await $models.ForecastEntry.bulkCreate(newEntries);
};

/**
 * Calculate forecast entries for element: bonus provision
 * Only for permanent consultants
 */
const calculateBonusProvision = async ({
  $models,
  financialYear,
  forecastElements,
  profitCentre_id,
  consultants,
}) => {
  const bonusElementId = forecastElements.find(e => e.key === 'BON').id;
  const forecastEntries = {};

  for (let i = 1; i < 13; i++) {
    const consultantBonuses = getConsultantBonusesByMonth({
      consultants,
      financialYear,
      financialMonth: i,
    });

    const key = getForecastEntryKey(financialYear, i, bonusElementId, true);

    consultantBonuses.forEach(cb => {
      if (!forecastEntries[key]) {
        forecastEntries[key] = {
          financialYear,
          financialMonth: i,
          forecastElement_id: bonusElementId,
          profitCentre_id,
          amount: 0,
        };
      }
      forecastEntries[key].amount += +cb.bonus;
    });
  }

  // Remove previous forecast entries and create new
  await $models.ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: bonusElementId,
      profitCentre_id,
    },
  });

  const newEntries = Object.values(forecastEntries);
  if (newEntries.length > 0) await $models.ForecastEntry.bulkCreate(newEntries);
};

/**
 * Calculate forecast entries for two elements: internal revenue and internal charge
 */
const calculateInternalRates = async ({
  $models,
  costCenters,
  allConsultants,
  consultants,
  financialYear,
  forecastElements,
  profitCentre_id,
  projectAssignmentLookup,
  projects,
}) => {
  const forecastEntries = {};
  const startDate = moment({
    year: financialYear,
    month: 6,
  });
  const endDate = startDate.clone().add(1, 'year');

  // Internal Revenue: negative cost, when consultants belong to this profit centre works on external projects
  const internalRevenues = await getInternalRevenue({
    $models,
    consultants,
    startDate,
    endDate,
    profitCentreIds: [profitCentre_id],
    projectAssignmentLookup,
  });
  const internalRevenueElementId = forecastElements.find(e => e.key === 'INTREV').id;

  // Calculate forecastEntries
  internalRevenues.forEach(({ internalRate, rosterEntry }) => {
    const key = getForecastEntryKeyByDate(rosterEntry.date, 'Internal Revenue');
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    if (!forecastEntries[key]) {
      forecastEntries[key] = {
        financialYear,
        financialMonth,
        forecastElement_id: internalRevenueElementId,
        profitCentre_id,
        amount: 0,
      };
    }
    forecastEntries[key].amount -= +internalRate;
  });

  // Internal Charge: postive cost, when external consultants work on projects belong to this profit centre
  const internalCharges = await getInternalCharge({
    $models,
    allConsultants,
    projects,
    costCenters,
    startDate,
    endDate,
    projectAssignmentLookup,
  });
  const internalChargeElementId = forecastElements.find(e => e.key === 'INTCH').id;

  // Calulate forecastEntries
  internalCharges.forEach(({ internalRate, rosterEntry }) => {
    const key = getForecastEntryKeyByDate(rosterEntry.date, 'Internal Charge');
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    if (!forecastEntries[key]) {
      forecastEntries[key] = {
        financialYear,
        financialMonth,
        forecastElement_id: internalChargeElementId,
        profitCentre_id,
        amount: 0,
      };
    }
    forecastEntries[key].amount += +internalRate;
  });

  // Destroy previous and create new entries in db
  await $models.ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: {
        $in: [internalRevenueElementId, internalChargeElementId],
      },
      profitCentre_id,
    },
  });
  await $models.ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

/**
 * Get fix price project revenues from project forecast
 *
 * @param {object} $models
 * @param {array of string} profitCentreIds
 * @return {object} base data
 */
const calculateFixPriceRevenues = async ({
  $models,
  profitCentre_id,
  projects,
  financialYear,
  forecastElements,
}) => {
  const forecastEntries = {};
  const fixPriceElementId = forecastElements.find(e => e.key === 'FIXREV').id;

  const projectForecastEntries = await $models.ProjectForecastEntry.findAll({
    where: {
      forecastType: '2',
      financialYear: financialYear.toString(),
      project_id: {
        $in: projects.map(p => p.id),
      },
    },
    limit: 1000,
  });

  projectForecastEntries.forEach(e => {
    const { financialMonth } = e;
    const key = getForecastEntryKey(financialYear, financialMonth, fixPriceElementId, true);
    if (!forecastEntries[key]) {
      forecastEntries[key] = {
        financialYear,
        financialMonth,
        forecastElement_id: fixPriceElementId,
        profitCentre_id,
        amount: 0,
      };
    }
    forecastEntries[key].amount += +e.amount;
  });

  // Destroy previous and create new entries in db
  await $models.ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: fixPriceElementId,
      profitCentre_id,
    },
  });
  await $models.ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

/**
 * Get general data in preparation for calculations
 *
 * @param {object} $models
 * @param {array of string} profitCentreIds
 * @return {object} base data
 */
export const calculateBaseData = async ({ $models, profitCentreIds }) => {
  // Find cost centers and consultants of all profit centres
  const costCenters = await $models.CostCenter.findAll({
    where: {
      profitCentre_id: {
        $in: profitCentreIds,
      },
    },
    limit: 1000,
  });
  const costCenterIds = costCenters.map(cc => cc.id);

  const allConsultants = await $models.Consultant.findAll({
    include: [{ as: 'costCenter' }],
    limit: 1000,
  });

  const consultants = allConsultants.filter(c => costCenterIds.indexOf(c.costCenter_id) !== -1);

  const consultantIds = consultants.map(c => c.id);

  // Find all projects
  const projects = await $models.Project.findAll({
    where: {
      profitCentre_id: {
        $in: profitCentreIds,
      },
    },
    limit: 1000,
  });

  const projectIds = projects.map(p => p.id);

  // Create lookup for project assignments
  const pa1 = await $models.ProjectAssignment.findAll({
    where: {
      consultant_id: { $in: consultantIds },
    },
    limit: 1000,
  });

  const pa2 = await $models.ProjectAssignment.findAll({
    where: {
      project_id: { $in: projectIds },
    },
    limit: 1000,
  });

  const projectAssignmentLookup = {};
  for (const pa of [...pa1, ...pa2]) {
    projectAssignmentLookup[`${pa.consultant_id}.${pa.project_id}`] = pa;
  }

  // Find forecast elements
  const forecastElements = await $models.ForecastElement.findAll({
    where: {
      key: {
        $in: ['TMREV', 'FIXREV', 'CWAGES', 'SAL', 'BON', 'INTCH', 'INTREV'],
      },
    },
  });

  // General data for future calculations
  return {
    costCenters,
    allConsultants,
    consultants,
    projects,
    forecastElements,
    projectAssignmentLookup,
  };
};

/**
 * Calculate following forecast elements for a profit centre:
 *  - 'Service Revenue'
 *  - 'Fix Price Services'
 *  - 'Consultant Salaries'
 *  - 'Contractor Wages'
 *  - 'Internal Revenue'
 *  - 'Internal Charge'
 * Remove previous forecast entries and create new.
 *
 * @param {object} $models
 * @param {string} profitCentre_id
 * @param {string} financialYear
 * @param {array of object} costCenters
 * @param {array of object} allConsultants
 * @param {array of object} consultants
 * @param {array of object} forecastElements
 * @param {array of object} projects
 * @param {object} projectAssignmentLookup
 * @return {Promise}
 */
export const calculateForecastForProfitCentre = params =>
  Promise.all([
    calculateServiceRevenue(params),
    calculateContractorWages(params),
    calculateConsultantSalaries(params),
    calculateBonusProvision(params),
    calculateInternalRates(params),
    calculateFixPriceRevenues(params),
  ]);

/**
 * Similar to above, but gets profitCentreIds instead of single profitCentre_id
 */
export const calculateForecastForCompany = ({
  profitCentreIds,
  costCenters,
  consultants,
  projects,
  ...others
}) =>
  Promise.all(
    profitCentreIds.map(profitCentre_id => {
      // Filter out resources not in this profit centre
      const costCentersInPc = costCenters.filter(cc => cc.profitCentre_id === profitCentre_id);
      const consultantsInPc = consultants.filter(
        c => c.costCenter.profitCentre_id === profitCentre_id,
      );
      const projectsInPc = projects.filter(p => p.profitCentre_id === profitCentre_id);

      return calculateForecastForProfitCentre({
        profitCentre_id,
        consultants: consultantsInPc,
        costCenters: costCentersInPc,
        projects: projectsInPc,
        ...others,
      });
    }),
  );
