import React from 'react';
import moment from 'moment';

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

    const consultant = {
      active: true,
      annualSalary: '120000.00',
      consultantType: '1',
      costCenter_id: '1',
      internalRate: '600.00',
      name: 'Consultant',
      startDate: '2018-01-01',
    };

    let n;
    const a = [];
    for (n = 1; n < 20; n++) {
      a.push({ ...consultant, name: `Consultant ${n}` });
    }

    try {
      await Consultant.bulkCreate(a);
    } catch (e) {
      console.log(e);
    }

    alert('finished');
  };

  generateProjectAssigments = async () => {
    const { Consultant, ProjectAssignment, RosterEntry, Project } = this.props.$models;
    const consultants = await Consultant.findAll({ limit: 1000 });
    await ProjectAssignment.destroy({ where: {} });
    await RosterEntry.destroy({ where: {} });
    const projects = await Project.findAll({});
    const project_id = projects[0].id;

    const a = [];
    for (const c of consultants) {
      // assign this consultant to a project
      a.push({ consultant_id: c.id, project_id, dayRate: '700' });
    }

    try {
      await ProjectAssignment.bulkCreate(a);
      console.log('created project assignments');
    } catch (err) {
      console.log(err);
    }

    alert('done');
  };

  generateRosterEntries = async () => {
    const { Consultant, Project } = this.props.$models;

    const consultants = await Consultant.findAll({ limit: 1000 });
    const projects = await Project.findAll({});
    const project_id = projects[0].id;

    const e = [];
    for (const c of consultants) {
      // book this consultant for multiple days
      for (let i = 0; i <= 365; i++) {
        const date = moment()
          .add(i, 'days')
          .format('YYYY-MM-DD');
        e.push({ consultant_id: c.id, project_id, probability: '1', date });
      }
    }

    try {
      await this.props.$models.RosterEntry.bulkCreate(e);
      console.log('created roster entries');
    } catch (err) {
      console.log(err);
    }

    alert('finished');
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
        <button onClick={this.generateProjectAssigments}>Generate Project Assignments</button>
        <button onClick={this.generateRosterEntries}>Generate Roster Entries</button>
      </div>
    );
  }
}

export default Dummy;
