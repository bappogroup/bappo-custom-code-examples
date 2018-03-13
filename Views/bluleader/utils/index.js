import moment from 'moment';

// Generate a unique key for a forecast entry, to uniquely find an entry in a map.
// Cost center id is optional
export const getForecastEntryKey = (year, month, elementId, costCenterId) =>
  `${year}.${month}.${elementId}.${costCenterId || 'na'}`;

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
      calculateServiceRevenue({
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

// Calculate service revenue in a financial year, for a profit centre
// And update the forecast entrie records
export const calculateServiceRevenue = async ({
  $models,
  financialYear,
  profitCentre_id,
}) => {
  const { Project, RosterEntry, ForecastEntry, ForecastElement } = $models;
  const forecastEntries = {};

  // Find forecast element 'Service Revenue'
  const elements = await ForecastElement.findAll({
    where: {
      key: 'TMREV',
    },
  });

  if (elements.length === 0) return;
  const elementId = elements[0].id;

  // Fetching exisiting forecast entries of the element, with given profit center and year
  await ForecastEntry.destroy({
    where: {
      financialYear: financialYear.toString(),
      forecastElement_id: elementId,
      profitCentre_id,
    },
  });

  // Initialize the element's forecast entries of all months
  for (let i = 1; i < 13; i++) {
    const key = getForecastEntryKey(financialYear, i, elementId);

    forecastEntries[key] = {
      financialYear,
      financialMonth: i,
      forecastElement_id: elementId,
      costCentre_id: null,
      profitCentre_id,
      amount: 0, // amount is cleared, to recalculate
    };
  }

  // Find projects that belong to this profit centre
  const projectIds = (await Project.findAll({
    where: {
      profitCentre_id,
    },
    limit: 1000,
  })).map(p => p.id);

  // Fetch roster entries for the whole financial year, of this profit centre
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
            month: 5,
          }).toDate(),
        ],
      },
      project_id: {
        $in: projectIds,
      },
    },
    limit: 100000,
  });

  // Calculate forecast entries
  for (const rosterEntry of rosterEntries) {
    // Convert calendar month to financial month number
    let month = moment(rosterEntry.date).month() + 1 - 6;
    if (month < 0) month += 12;

    const key = getForecastEntryKey(financialYear, month, elementId);
    forecastEntries[key].amount += +rosterEntry.revenue;
  }

  // Create or update in db
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
  const elements = await ForecastElement.findAll({
    where: {
      key: 'SAL',
    },
  });

  if (elements.length === 0) return;
  const elementId = elements[0].id;

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
      const key = getForecastEntryKey(
        financialYear,
        i,
        elementId,
        costCenterId,
      );

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
      const monthlySalary = consultant.annualSalary
        ? +consultant.annualSalary / 12
        : 0;
      const key = getForecastEntryKey(
        financialYear,
        i,
        elementId,
        consultant.costCenter_id,
      );
      forecastEntries[key].amount += monthlySalary;
    }
  }

  // Create or update in db
  const forecastEntriesArr = Object.values(forecastEntries);
  for (const fe of forecastEntriesArr) {
    fe.amount = Math.floor(fe.amount);
  }
  await ForecastEntry.bulkCreate(forecastEntriesArr);
};

const uniq = a => [...new Set(a)];
