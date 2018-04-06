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
const getWageRosterEntries = async ({ $models, calendarYear, calendarMonth, projects }) => {
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

// Calculate 'Service Revenue' row and 'Contractor Wages' row in a financial year, of a profit centre
// And update the forecast entrie records
const calculateServiceRevenueAndContractorWages = async ({
  $models,
  financialYear,
  forecastElements,
  profitCentre_id,
  projectAssignmentLookup,
  projects,
  consultants,
}) => {
  const { RosterEntry, ForecastEntry } = $models;
  const forecastEntries = {};

  const serviceRevenueElementId = forecastElements.find(e => e.key === 'TMREV').id;
  const contractorWagesElementId = forecastElements.find(e => e.key === 'CWAGES').id;
  if (!(projects.length && serviceRevenueElementId && contractorWagesElementId)) return;

  const consultantsInPc = consultants.filter(c => c.costCenter.profitCentre_id === profitCentre_id);
  const projectsInPc = projects.filter(p => p.profitCentre_id === profitCentre_id);
  const consultantIds = consultantsInPc.map(c => c.id);
  const projectIds = projectsInPc.map(p => p.id);

  // Fetch roster entries for the whole financial year, of this profit centre
  // include consultants if it's a contractor
  const startDate = moment({
    year: financialYear,
    month: 6,
  });
  const endDate = startDate.clone().add(1, 'year');
  let rosterEntriesByProjects = [];
  if (projectIds.length > 0) {
    rosterEntriesByProjects = await RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.toDate(), endDate.toDate()],
        },
        project_id: {
          $in: projectIds,
        },
      },
      include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });
  }
  let rosterEntriesByConsultants = [];
  if (consultantIds.lengt > 0) {
    rosterEntriesByConsultants = await RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.toDate(), endDate.toDate()],
        },
        consultant_id: {
          $in: consultantIds,
        },
      },
      include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });
  }

  // Calculate forecast entries
  for (const rosterEntry of rosterEntriesByProjects) {
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
  }

  for (const rosterEntry of rosterEntriesByConsultants) {
    const { financialMonth } = time.getFinancialTimeFromDate(rosterEntry.date);
    const { calendarMonth, calendarYear } = time.financialToCalendar({
      financialYear,
      financialMonth,
    });

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
      consultants: consultants.filter(c => c.costCenter.profitCentre_id === profitCentre_id),
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

const getInternalRevenue = async ({
  $models,
  consultants,
  startDate,
  endDate,
  profitCentreIds,
  projectAssignmentLookup,
}) => {
  // Internal Revenue: negative cost, when consultants belong to this profit centre works on external projects
  const internalRevenues = [];
  const consultantIds = consultants.map(c => c.id);

  let consultantRosterEntries = [];
  if (consultantIds.length > 0) {
    consultantRosterEntries = await $models.RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.toDate(), endDate.toDate()],
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
    if (!projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`]) {
      console.log(1, projectAssignmentLookup, ee);
    }
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = consultants.find(c => c.id === ee.consultant_id);
      if (!consultant) {
        console.log(1.5, consultants, ee);
      }
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

const getInternalCharge = async ({
  $models,
  consultants,
  costCenters,
  startDate,
  endDate,
  projects,
  projectAssignmentLookup,
}) => {
  const costCenterIds = costCenters.map(cc => cc.id);

  // Internal Charge: postive cost, when external consultants work on projects belong to this profit centre
  const internalCharges = [];
  const projectIds = projects.map(c => c.id);
  let projectRosterEntries = [];
  if (projectIds.length > 0) {
    projectRosterEntries = await $models.RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.toDate(), endDate.toDate()],
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
    if (!projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`]) {
      console.log(2, projectAssignmentLookup, ee);
    }
    let { internalRate } = projectAssignmentLookup[`${ee.consultant_id}.${ee.project_id}`];
    if (!internalRate) {
      const consultant = consultants.find(c => c.id === ee.consultant_id);
      if (!consultant) {
        console.log(2.5, consultants, ee);
      }
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

const calculateInternalRates = async ({
  $models,
  costCenters,
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

  const costCentersInPc = costCenters.filter(cc => cc.profitCentre_id === profitCentre_id);
  const consultantsInPc = consultants.filter(c => c.costCenter.profitCentre_id === profitCentre_id);
  const projectsInPc = projects.filter(p => p.profitCentre_id === profitCentre_id);

  // Internal Revenue: negative cost, when consultants belong to this profit centre works on external projects
  const internalRevenues = await getInternalRevenue({
    $models,
    consultants: consultantsInPc,
    // projects: projectsInPc,
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
    consultants: consultantsInPc,
    projects: projectsInPc,
    costCenters: costCentersInPc,
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
 * Get general data in preparation for calculations
 *
 * @param {object} $models
 * @param {array of string} profitCentreIds
 * @return {object} base data
 */
const calculateBaseData = async ({ $models, profitCentreIds }) => {
  // Find all consultants
  const costCenters = await $models.CostCenter.findAll({
    where: {
      profitCentre_id: {
        $in: profitCentreIds,
      },
    },
    limit: 1000,
  });
  const costCenterIds = costCenters.map(cc => cc.id);

  const consultants = await $models.Consultant.findAll({
    where: {
      costCenter_id: {
        $in: costCenterIds,
      },
    },
    include: [{ as: 'costCenter' }],
    limit: 1000,
  });

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
        $in: ['TMREV', 'CWAGES', 'SAL', 'INTCH', 'INTREV'],
      },
    },
  });

  // General data for calculations
  return {
    costCenters,
    consultants,
    forecastElements,
    profitCentreIds,
    projects,
    projectAssignmentLookup,
  };
};

/**
 * Calculate five forecast elements for a profit centre:
 *  - 'Service Revenue'
 *  - 'Consultant Salaries'
 *  - 'Contractor Wages'
 *  - 'Internal Revenue'
 *  - 'Internal Charge'
 * Remove previous forecast entries and create new.
 *
 * @param {object} $models
 * @param {string} profitCentre_id
 * @param {array of object} costCenters
 * @param {array of object} consultants
 * @param {array of object} forecastElements
 * @param {array of object} projects
 * @param {object} projectAssignmentLookup
 * @return {Promise}
 */
const calculateForecastForProfitCentre = params =>
  Promise.all([
    calculateServiceRevenueAndContractorWages(params),
    calculateConsultantSalaries(params),
    calculateInternalRates(params),
  ]);

/**
 * Similar to above, but gets profitCentreIds instead of single profitCentre_id
 */
const calculateForecastForCompany = ({ profitCentreIds, ...others }) =>
  Promise.all(
    profitCentreIds.map(profitCentre_id =>
      calculateForecastForProfitCentre({
        profitCentre_id,
        ...others,
      }),
    ),
  );

export default Object.assign({}, time, rosterTime, {
  getForecastEntryKey,
  getForecastEntryKeyByDate,
  getWageRosterEntries,
  getServiceRevenueRosterEntries,
  getConsultantSalariesByMonth,
  getInternalRevenue,
  getInternalCharge,
  calculateBaseData,
  calculateForecastForProfitCentre,
  calculateForecastForCompany,
});
