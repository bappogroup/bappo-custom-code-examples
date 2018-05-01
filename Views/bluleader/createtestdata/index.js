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

  generateConsultants = async () => {
    const { Consultant } = this.props.$models;

    Consultant.destroy({ where: {} });

    const count = 100;

    const consultant = {
      active: true,
      annualSalary: '120000.00',
      consultantType: '2',
      costCenter_id: '1',
      internalRate: '600.00',
      name: 'Consultant',
      startDate: '2018-01-01',
    };

    let n;
    const a = [];
    for (n = 1; n < count; n++) {
      a.push({ ...consultant, name: `Consultant ${n}` });
    }

    try {
      await Consultant.bulkCreate(a);
    } catch (e) {
      console.log(e);
    }

    this.generateProjectAssigments();
    alert('done');
  };

  generateProjectAssigments = async () => {
    const { Consultant, ProjectAssignment } = this.props.$models;
    const consultants = await Consultant.findAll({ limit: 1000 });
    await ProjectAssignment.destroy({ where: {} });

    const a = [];
    for (let c of consultants) {
      a.push({ consultant_id: c.id, project_id: '1', dayRate: '700' });
    }

    try {
      await ProjectAssignment.bulkCreate(a);
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
        <button onClick={this.generateConsultants}>Generate Consultants</button>
      </div>
    );
  }
}

export default Dummy;
