import moment from 'moment';
import _ from 'lodash';
import time from './time';
import * as rosterTime from './rosterTime';

/**
 * Generate a unique key for a forecast entry in a table.
 *
 * @param {string} date - a date that moment can parse, e.g. '2018-03-03'
 * @param {string} rowIdentifier - a string identifying a row in the table
 * @return {string} entry key
 */
const getForecastEntryKeyByDate = (date, rowIdentifier) => {
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
const getForecastEntryKey = (year, month, rowIdentifier, shouldConvertToCalendar = false) => {
  if (!shouldConvertToCalendar) return `${year}.${month}.${rowIdentifier}`;

  const { calendarYear, calendarMonth } = time.financialToCalendar({
    financialYear: year,
    financialMonth: month,
  });

  return `${calendarYear}.${calendarMonth}.${rowIdentifier}`;
};

// Initialize forecast entries for element 'Contractor Wages'
const billableProbabilities = ['50%', '90%', '100%'];

/**
 * Determine whether a roster entry incurs contractor wage
 *
 * @param {object} roster entry
 * @return {bool}
 */
const rosterEntryIncursContractorWages = rosterEntry => {
  // Find roster entries that incur 'Contractor Wages', and update forecast entries for that element
  // Conditions are:
  // - prob >= 50%,
  // - project type === 2 ('T&M')
  // - consultant type === 2 ('Contractor')
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
const getWageRosterEntries = async ({ $models, calendarYear, calendarMonth, profitCentreIds }) => {
  if (!(calendarYear && calendarMonth && profitCentreIds.length)) return [];

  const projects = await $models.Project.findAll({
    where: {
      profitCentre_id: {
        $in: profitCentreIds,
      },
    },
    limit: 1000,
  });

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
          startDate.toDate(),
          startDate
            .clone()
            .add(1, 'month')
            .toDate(),
        ],
      },
      project_id: {
        $in: projects.map(pj => pj.id),
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
const getServiceRevenueRosterEntries = async ({
  $models,
  calendarYear,
  calendarMonth,
  consultantIds,
  profitCentreIds,
}) => {
  if (!(calendarYear && calendarMonth && profitCentreIds.length && consultantIds.length)) {
    return [];
  }

  // Fetch roster entries of given month
  const projects = await $models.Project.findAll({
    where: {
      profitCentre_id: {
        $in: profitCentreIds,
      },
    },
    limit: 1000,
  });

  const startDate = moment({
    year: calendarYear,
    month: calendarMonth - 1,
    day: 1,
  });

  const rosterEntries = await $models.RosterEntry.findAll({
    where: {
      date: {
        $between: [
          startDate.toDate(),
          startDate
            .clone()
            .add(1, 'month')
            .toDate(),
        ],
      },
      project_id: {
        $in: projects.map(pj => pj.id),
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Create lookup for project assignments
  // TODO: remove
  const pa1 = await $models.ProjectAssignment.findAll({
    where: {
      consultant_id: { $in: consultantIds },
    },
    limit: 1000,
  });

  const pa2 = await $models.ProjectAssignment.findAll({
    where: {
      project_id: { $in: projects.map(p => p.id) },
    },
    limit: 1000,
  });

  const projectAssignmentLookup = {};
  for (const pa of [...pa1, ...pa2]) {
    projectAssignmentLookup[`${pa.consultant_id}.${pa.project_id}`] = pa;
  }

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
 * Calculate consultant salaries of a given month
 *
 * @return {array} array of object containing consultant and salary
 */
const getConsultantSalariesByMonth = ({ consultants, financialYear, financialMonth }) => {
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

      const salary = Math.floor(monthlySalary * (validDays / totalDays));

      consultantSalaries.push({
        consultant,
        salary,
      });
    }
  }

  return consultantSalaries;
};

// Calculate 'Service Revenue' row and 'Contractor Wages' row in a financial year, of a profit centre
// And update the forecast entrie records
const calculateServiceRevenueAndContractorWages = async ({
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
  const contractorWagesElementId = forecastElements.find(e => e.key === 'CWAGES').id;
  if (!(projects.length && serviceRevenueElementId && contractorWagesElementId)) return;

  const projectIds = projects.map(p => p.id);

  // Fetch roster entries for the whole financial year, of this profit centre
  // include consultants if it's a contractor
  const startDate = moment({
    year: financialYear,
    month: 6,
  });
  const rosterEntries = await RosterEntry.findAll({
    where: {
      date: {
        $between: [
          startDate.toDate(),
          startDate
            .clone()
            .add(1, 'year')
            .toDate(),
        ],
      },
      project_id: {
        $in: projectIds,
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Calculate forecast entries
  for (const rosterEntry of rosterEntries) {
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    const { calendarMonth, calendarYear } = time.financialToCalendar({
      financialYear,
      financialMonth,
    });

    // Service Revenue
    const { dayRate } = projectAssignmentLookup[
      `${rosterEntry.consultant_id}.${rosterEntry.project_id}`
    ];

    const serviceRevenueKey = getForecastEntryKey(
      calendarYear,
      calendarMonth,
      serviceRevenueElementId,
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

    // Contractor Wages
    if (rosterEntryIncursContractorWages(rosterEntry)) {
      const contractorWagesKey = getForecastEntryKey(
        calendarYear,
        calendarMonth,
        contractorWagesElementId,
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
      forecastEntries[contractorWagesKey].amount += +rosterEntry.consultant.dailyRate;
    }
  }

  // Remove previous forecast entries and create new
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: {
        $in: [serviceRevenueElementId, contractorWagesElementId],
      },
      profitCentre_id,
    },
  });
  await ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

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
      forecastEntries[key].amount += cs.salary;
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
  await $models.ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

const calculateInternalRates = async ({
  $models,
  costCenterIds,
  consultants,
  financialYear,
  forecastElements,
  profitCentre_id,
  projectAssignmentLookup,
  projects,
}) => {
  const forecastEntries = {};

  // Internal Revenue: negative cost, when consultants belong to this profit centre works on external projects
  const internalRevenueEntries = [];
  const internalRevenueElementId = forecastElements.find(e => e.key === 'INTREV').id;
  const consultantRosterEntries = await $models.RosterEntry.findAll({
    where: {
      consultant_id: {
        $in: consultants.map(c => c.id),
      },
    },
    include: [{ as: 'project' }, { as: 'consultant' }],
    limit: 10000,
  });

  const externalRevenueEntries = consultantRosterEntries.filter(
    ce => ce.project.profitCentre_id !== profitCentre_id,
  );

  externalRevenueEntries.forEach(ee => {
    // Get internalRate: from projectAssignment or consultant
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = consultants.find(c => c.id === ee.consultant_id);
      ({ internalRate } = consultant);
    }

    internalRevenueEntries.push({
      rosterEntry: ee,
      consultantName: ee.consultant.name,
      internalRate,
    });
  });

  // Calculate forecastEntries
  internalRevenueEntries.forEach(({ internalRate, rosterEntry }) => {
    const key = getForecastEntryKeyByDate(rosterEntry.date, 'Internal Revenue');
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    if (!forecastEntries[key]) {
      forecastEntries[key] = {
        financialYear,
        financialMonth,
        elementId: internalRevenueElementId,
        profitCentre_id,
        amount: 0,
      };
    }
    forecastEntries[key].amount -= +internalRate;
  });

  // Internal Charge: postive cost, when external consultants work on projects belong to this profit centre
  const internalChargeEntries = [];
  const internalChargeElementId = forecastElements.find(e => e.key === 'INTCH').id;
  const projectRosterEntries = await $models.RosterEntry.findAll({
    where: {
      project_id: {
        $in: projects.map(c => c.id),
      },
    },
    include: [{ as: 'project' }, { as: 'consultant' }],
    limit: 10000,
  });

  const externalCostEntries = projectRosterEntries.filter(
    pe => costCenterIds.indexOf(pe.consultant.costCenter_id) === -1,
  );

  externalCostEntries.forEach(ee => {
    // Get internalRate: from projectAssignment or consultant
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = consultants.find(c => c.id === ee.consultant_id);
      ({ internalRate } = consultant);
    }

    internalChargeEntries.push({
      rosterEntry: ee,
      consultantName: ee.consultant.name,
      internalRate,
    });
  });

  // Calulate forecastEntries
  internalChargeEntries.forEach(({ internalRate, rosterEntry }) => {
    const key = getForecastEntryKeyByDate(rosterEntry.date, 'Internal Charge');
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    if (!forecastEntries[key]) {
      forecastEntries[key] = {
        financialYear,
        financialMonth,
        elementId: internalChargeElementId,
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

const GetCalculationBaseData = ({}) => {};

const calculateForecast = ({ $models, financialYear, profitCentreIds }) =>
  Promise.all(
    profitCentreIds.map(async profitCentre_id => {
      // Find all consultants in this profitCentre
      const costCenters = await $models.CostCenter.findAll({
        where: {
          profitCentre_id,
        },
      });
      const costCenterIds = costCenters.map(cc => cc.id);

      const consultants = await $models.Consultant.findAll({
        where: {
          costCenter_id: {
            $in: costCenterIds,
          },
        },
      });

      const consultantIds = consultants.map(c => c.id);

      // Find all projects in this profitCentre
      const projects = await $models.Project.findAll({
        where: {
          profitCentre_id,
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
            $in: ['TMREV', 'CWAGES', 'SAL', 'INTCH', 'INTREV'],
          },
        },
      });

      // Common params for calculations
      const params = {
        $models,
        costCenterIds,
        consultants,
        financialYear,
        forecastElements,
        profitCentre_id,
        projects,
        projectAssignmentLookup,
      };

      // Process each profit center:
      //  - calculate Service Revenue
      //  - calculate Consultant Salaries
      //  - calculate internal cost and revenue
      return Promise.all([
        calculateServiceRevenueAndContractorWages(params),
        calculateConsultantSalaries(params),
        calculateInternalRates(params),
      ]);
    }),
  );

export default Object.assign({}, time, rosterTime, {
  getForecastEntryKey,
  getForecastEntryKeyByDate,
  getWageRosterEntries,
  getServiceRevenueRosterEntries,
  getConsultantSalariesByMonth,
  calculateForecast,
});
