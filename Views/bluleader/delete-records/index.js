import React from 'react';

class Dummy extends React.Component {
  deleteAllForecastEntries = async () => {
    const { ForecastEntry } = this.props.$models;
    try {
      await ForecastEntry.destroy({
        where: {},
      });
      alert('done');
    } catch (e) {
      console.log(e);
    }
  };

  deleteAllProjectForecastEntries = async () => {
    const { ProjectForecastEntry } = this.props.$models;
    try {
      await ProjectForecastEntry.destroy({
        where: {},
      });
      alert('done');
    } catch (e) {
      console.log(e);
    }
  };

  deleteAllRosterEntries = async () => {
    const { RosterEntry } = this.props.$models;
    try {
      await RosterEntry.destroy({
        where: {},
      });
      alert('done');
    } catch (e) {
      console.log(e);
    }
  };

  deleteAllUserPreferences = async () => {
    const { UserPreference } = this.props.$models;
    try {
      await UserPreference.destroy({
        where: {},
      });
      alert('done');
    } catch (e) {
      console.log(e);
    }
  };

  render() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button onClick={this.deleteAllForecastEntries}>Delete all Forecast Entry Records</button>
        <button onClick={this.deleteAllProjectForecastEntries}>
          Delete all Project Forecast Entry Records
        </button>
        <button onClick={this.deleteAllRosterEntries}>Delete all Roster Entry Records</button>
        <button onClick={this.deleteAllUserPreferences}>Delete all User Preferences</button>
      </div>
    );
  }
}

export default Dummy;
