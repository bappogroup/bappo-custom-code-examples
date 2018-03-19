import moment from 'moment';
import _ from 'lodash';

// Get current financial year
export const getCurrentFinancialYear = () => {
  const quarter = moment().quarter();

  if (quarter === 1 || quarter === 2) return moment().year();
  return moment().year() + 1;
};

// Generate a unique key for a forecast entry, to uniquely find an entry in a map.
export const getForecastEntryKey = (year, month, elementId) =>
  `${year}.${month}.${elementId}`;

export const calculateForecast = async ({
  $models,
  financialYear,
  profitCentreIds,
}) => {
  const promises = [];
  for (let profitCentre_id of profitCentreIds) {
    // Process each profit center:
    //  - calculate Service Revenue
    //  - calculate Consultant Salaries
    promises.push(
      calculateServiceRevenueAndContractorWages({
        $models,
        financialYear,
        profitCentre_id,
      }),
      calculateConsultantSalaries({
        $models,
        financialYear,
        profitCentre_id,
      }),
    );
  }
  await Promise.all(promises);
};

// Calculate 'Service Revenue' row and 'Contractor Wages' row in a financial year, of a profit centre
// And update the forecast entrie records
export const calculateServiceRevenueAndContractorWages = async ({
  $models,
  financialYear,
  profitCentre_id,
}) => {
  const {
    Project,
    RosterEntry,
    ForecastEntry,
    ForecastElement,
    Consultant,
  } = $models;
  const forecastEntries = {};

  // Find forecast element 'Service Revenue' and 'Contractor Wages'
  const elements = await ForecastElement.findAll({
    where: {
      key: {
        $in: ['TMREV', 'CWAGES'],
      },
    },
  });
  if (elements.length === 0) return;
  let serviceRevenueElementId, contractorWagesElementId;
  elements.forEach(element => {
    switch (element.key) {
      case 'TMREV':
        serviceRevenueElementId = element.id;
        break;
      case 'CWAGES':
        contractorWagesElementId = element.id;
        break;
      default:
    }
  });

  if (!(serviceRevenueElementId && contractorWagesElementId)) return;

  // Fetching exisiting forecast entries of the two elements, with given profit center and year
  // TODO: fix destroy & $in bug
  // await ForecastEntry.destroy({
  //   where: {
  //     financialYear: financialYear.toString(),
  //     forecastElement_id: {
  //       $in: [serviceRevenueElementId, contractorWagesElementId],
  //     },
  //     profitCentre_id,
  //   },
  // });
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: serviceRevenueElementId,
      profitCentre_id,
    },
  });
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: contractorWagesElementId,
      profitCentre_id,
    },
  });

  // Initialize the element's forecast entries of all months
  for (let i = 1; i < 13; i++) {
    const key1 = getForecastEntryKey(financialYear, i, serviceRevenueElementId);
    const key2 = getForecastEntryKey(
      financialYear,
      i,
      contractorWagesElementId,
    );

    const entryTemplate = {
      financialYear,
      financialMonth: i,
      costCentre_id: null,
      profitCentre_id,
      amount: 0, // amount is cleared, to recalculate
    };

    forecastEntries[key1] = {
      ...entryTemplate,
      forecastElement_id: serviceRevenueElementId,
    };
    forecastEntries[key2] = {
      ...entryTemplate,
      forecastElement_id: contractorWagesElementId,
    };
  }

  // Find projects that belong to this profit centre
  const projects = await Project.findAll({
    where: {
      profitCentre_id,
    },
    limit: 1000,
  });
  const projectIds = projects.map(p => p.id);

  // Fetch roster entries for the whole financial year, of this profit centre
  // include consultants if it's a contractor
  const rosterEntries = await RosterEntry.findAll({
    where: {
      date: {
        $between: [
          moment({
            year: financialYear - 1,
            month: 6,
          }).toDate(),
          moment({
            year: financialYear,
            month: 6,
          }).toDate(),
        ],
      },
      project_id: {
        $in: projectIds,
      },
    },
    include: [{ as: 'consultant' }, { as: 'project' }, { as: 'probability' }],
    limit: 100000,
  });

  // Initialize forecast entries for element 'Contractor Wages'
  const billableProbabilities = ['50%', '90%', '100%'];

  // Calculate forecast entries
  for (const rosterEntry of rosterEntries) {
    // Convert calendar month to financial month number
    let month = moment(rosterEntry.date).month() + 1 - 6;
    if (month <= 0) month += 12;

    const serviceRevenueKey = getForecastEntryKey(
      financialYear,
      month,
      serviceRevenueElementId,
    );
    forecastEntries[serviceRevenueKey].amount += +rosterEntry.revenue;

    // Find roster entries that incur 'Contractor Wages', and update forecast entries for that element
    // Conditions are:
    // - prob >= 50%,
    // - project type === 2 ('billing')
    // - consultant type === 2 ('Contractor')
    const probability = _.get(rosterEntry, 'probability.name');
    if (
      _.get(rosterEntry, 'consultant.consultantType') === '2' &&
      _.get(rosterEntry, 'project.projectType') === '2' &&
      billableProbabilities.includes(probability)
    ) {
      const contractorWagesKey = getForecastEntryKey(
        financialYear,
        month,
        contractorWagesElementId,
      );
      forecastEntries[contractorWagesKey].amount += +rosterEntry.consultant
        .dailyRate;
    }
  }

  // Create forecast entries  in db
  await ForecastEntry.bulkCreate(Object.values(forecastEntries));
};

export const calculateConsultantSalaries = async ({
  $models,
  financialYear,
  profitCentre_id,
}) => {
  const { ForecastEntry, ForecastElement, CostCenter, Consultant } = $models;
  const forecastEntries = {};

  // Find forecast element 'Consultant Salaries'
  const element = await ForecastElement.findOne({
    where: {
      key: 'SAL',
    },
  });

  if (!element) return;
  const elementId = element.id;

  // Fetching exisiting forecast entries of the element, with given profit center and year
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: elementId,
      profitCentre_id,
    },
  });

  const costCenterIds = (await CostCenter.findAll({
    where: { profitCentre_id },
  })).map(cc => cc.id);

  // Ensure forecast entries of all months to be calculated exist
  // if not, initialize forecast entries with basic attributes
  for (let i = 1; i < 13; i++) {
    // Iterate over all related costCenters, and 'null' costCenter
    for (const costCenterId of costCenterIds) {
      const key = getForecastEntryKey(financialYear, i, elementId);

      forecastEntries[key] = {
        financialYear,
        financialMonth: i,
        forecastElement_id: elementId,
        costCentre_id: costCenterId,
        profitCentre_id,
        amount: 0, // amount is cleared, to recalculate
      };
    }
  }

  // Find all consultants related
  const consultants = await Consultant.findAll({
    where: {
      costCenter_id: {
        $in: costCenterIds,
      },
    },
  });

  // Calculate forecast entries by adding up monthly salaris by cost centers
  for (let i = 1; i < 13; i++) {
    for (const consultant of consultants) {
      // Exclude contractors
      if (consultant.consultantType !== '2') {
        const monthlySalary = consultant.annualSalary
          ? +consultant.annualSalary / 12
          : 0;

        let salary = 0;

        // Convert financialMonth to calendar month
        let calendarMonth = i + 6;
        let calendarYear = financialYear;

        if (calendarMonth > 12) {
          calendarMonth -= 12;
        } else {
          calendarYear -= 1;
        }
        calendarMonth = ('0' + calendarMonth).slice(-2);
        const calendarDate = `${calendarYear}-${calendarMonth}-01`;

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
            if (
              m.isSameOrAfter(consultantStart) &&
              m.isSameOrBefore(consultantEnd)
            ) {
              validDays++;
            }
          } else if (m.isSameOrAfter(consultantStart)) {
            validDays++;
          }
        }

        const key = getForecastEntryKey(financialYear, i, elementId);

        forecastEntries[key].amount += monthlySalary * (validDays / totalDays);
      }
    }
  }

  // Create or update in db
  const forecastEntriesArr = Object.values(forecastEntries);
  for (const fe of forecastEntriesArr) {
    fe.amount = Math.floor(fe.amount);
  }
  await ForecastEntry.bulkCreate(forecastEntriesArr);
};
