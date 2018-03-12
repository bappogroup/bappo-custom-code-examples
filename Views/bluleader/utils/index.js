import moment from 'moment';

const getEntryKey = (year, month, elementId) => `${year}.${month}.${elementId}`;

export const getPcConsultants = async ($models, pc_id) => {
  const { CostCenter, ConsultantEvent, Consultant } = $models;

  const costCenters = await CostCenter.findAll({
    where: { profitCentre_id: pc_id },
  });

  // Find all Consultant Events that have ever been associated
  // with the relevant cost centers
  const costCenterIds = costCenters.map(cc => cc.id);
  const consultants = await Consultant.findAll({
    where: {
      costCenter_id: {
        $in: costCenterIds,
      },
    },
  });

  return consultants;
};

export const getSalaries = async ($models, pc_id) => {
  return getPcConsultants($models, pc_id);
};

export const calculateForecast = async ($models, profitCentres) => {
  for (let pc of profitCentres) {
    // process one profit center here
    // calculate Service Revenue
    // calculate Consultant Salaries
  }
};

// Calculate service revenue in a financial year, for a profit centre
// And update the forecast entrie records
export const calculateServiceRevenue = async (
  $models,
  financialYear,
  profitCentre,
) => {
  const { Project, RosterEntry, ForecastEntry, ForecastElement } = $models;
  const forecastEntries = {};

  const elements = await ForecastElement.findAll({
    where: {
      name: 'Service Revenue',
    },
  });

  if (elements.length === 0) return;

  const elementId = elements[0].id;

  // Initialize forecast entries to be calculated
  for (let i = 1; i < 13; i++) {
    const key = getEntryKey(financialYear, i, elementId);
    forecastEntries[key] = {
      financialYear: financialYear,
      financialMonth: i,
      forecastElement_id: elementId,
      amount: 0,
      id: null, // TODO
      costCentre_id: null, // TODO
      profitCentre_id: profitCentre.id,
    };
  }

  // Find projects that belong to current profit centre
  const projectIds = (await Project.findAll({
    where: {
      profitCentre_id: profitCentre.id,
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

  for (const rosterEntry of rosterEntries) {
    // Convert calendar month to financial month number
    let month = moment(rosterEntry.date).month() + 1 - 6;
    if (month < 0) month += 12;

    const key = getEntryKey(financialYear, month, elementId);
    forecastEntries[key].amount += +rosterEntry.revenue;
  }

  await ForecastEntry.bulkUpdate(Object.values(forecastEntries));
};

const uniq = a => [...new Set(a)];
