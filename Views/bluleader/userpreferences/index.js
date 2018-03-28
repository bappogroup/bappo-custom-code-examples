export const getUserPreferences = async (user_id, $models) => {
  const { UserPreference } = $models;

  // Find User Prefs
  const prefsdata = await UserPreference.findAll({
    where: {
      user_id,
    },
  });

  const prefs = {};

  for (const pref of prefsdata) {
    prefs[pref.name] = pref.value;
  }

  return prefs;
};

export const setUserPreferences = async (user_id, $models, newPrefs) => {
  const { UserPreference } = $models;

  // Find User Prefs
  const prefsdata = await UserPreference.findAll({
    where: {
      user_id,
    },
  });

  const oldPrefs = {};
  const newRecords = [];
  const modifiedRecords = [];

  for (const pref of prefsdata) {
    oldPrefs[pref.name] = pref;
  }

  for (const key of Object.keys(newPrefs)) {
    const oldPref = oldPrefs[key];
    const newPref = { name: key, value: newPrefs[key], user_id };

    if (oldPref && newPref.value === oldPref.value) {
      // do nothing
    } else if (!oldPref) {
      // create new record
      newRecords.push(newPref);
    } else if (oldPref) {
      modifiedRecords.push({ ...oldPref, value: newPref.value });
    }
  }

  if (newRecords.length > 0) {
    try {
      await UserPreference.bulkCreate(newRecords);
    } catch (e) {
      console.log(e);
    }
  }

  if (modifiedRecords.length > 0) {
    try {
      await UserPreference.bulkUpdate(modifiedRecords);
    } catch (e) {
      console.log(e);
    }
  }
};
