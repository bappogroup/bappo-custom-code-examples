import React from 'react';
import { styled } from 'bappo-components';

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

  render() {
    return (
      <div>
        <button onClick={this.deleteAllForecastEntries}>
          Delete all Foreast Entry Records
        </button>
        <button onClick={this.deleteAllRosterEntries}>
          Delete all Roster Entry Records
        </button>
      </div>
    );
  }
}

export default Dummy;
