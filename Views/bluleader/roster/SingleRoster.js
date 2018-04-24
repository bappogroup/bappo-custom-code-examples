import React from 'react';
import moment from 'moment';
import { ActivityIndicator, FlatList, View, Text, Button, styled } from 'bappo-components';
import { getMonday, datesToArray } from 'utils';

const weekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function truncString(str, max = 18, add = '...') {
  add = add || '...';
  return typeof str === 'string' && str.length > max ? str.substring(0, max) + add : str;
}

class SingleRoster extends React.Component {
  state = {
    startDate: null,
    endDate: null,
    loading: true,
    consultant: null,
    entries: {},
    weeklyEntries: [],
    projectOptions: [],
  };

  async componentWillMount() {
    const { consultant_id, $models } = this.props;
    if (!consultant_id) return;

    const consultant = await $models.Consultant.findById(consultant_id);
    const projectAssignments = await $models.ProjectAssignment.findAll({
      where: {
        consultant_id,
      },
      include: [{ as: 'project' }],
      limit: 1000,
    });

    const projectOptions = projectAssignments.map(pa => ({
      id: pa.project_id,
      label: pa.project.name,
    }));

    await this.setState({ consultant, projectOptions });
    await this.loadRosterEntries();
  }

  loadRosterEntries = async extraWeeks => {
    const { consultant } = this.state;
    this.setState({ loading: true });

    // Fetch entries: 12 weeks from today
    const startDate = this.state.startDate || getMonday();
    const endDate =
      this.state.endDate ||
      getMonday()
        .add(12, 'week')
        .add('-1', 'day');

    if (extraWeeks) {
      if (extraWeeks > 0) {
        endDate.add(extraWeeks, 'week');
      } else {
        startDate.add(extraWeeks, 'week');
      }
    }

    const rosterEntries = await this.props.$models.RosterEntry.findAll({
      where: {
        consultant_id: consultant.id,
        date: {
          $between: [startDate.toDate(), endDate.toDate()],
        },
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 10000,
    });

    const entries = {};
    rosterEntries.forEach(entry => {
      entries[entry.date] = entry;
    });

    // Initialize empty entries
    for (let d = startDate.clone(); d.isBefore(endDate); d.add(1, 'day')) {
      const date = d.format('YYYY-MM-DD');
      if (!entries[date]) entries[date] = { date };
    }

    // Group entries by week
    const entriesByDate = datesToArray(startDate, endDate).map(
      date => entries[date.format('YYYY-MM-DD')],
    );
    const weeklyEntries = [];

    for (let i = 0; i <= entriesByDate.length; i += 7) {
      weeklyEntries.push(entriesByDate.slice(i, i + 7));
    }

    this.setState({
      loading: false,
      weeklyEntries,
      startDate,
      endDate,
    });
  };

  openEntryForm = entry => {
    this.props.$popup.form({
      objectKey: 'RosterEntry',
      fields: [
        'name',
        {
          name: 'project_id',
          label: 'Project',
          type: 'FixedList',
          properties: {
            options: this.state.projectOptions,
          },
          validate: [value => (value ? undefined : 'Required')],
        },
        {
          path: 'date',
          name: 'startDate',
          label: 'From',
        },
        {
          path: 'date',
          name: 'endDate',
          label: 'Until',
        },
        {
          name: 'mon',
          type: 'Checkbox',
          label: 'Monday',
        },
        {
          name: 'tue',
          type: 'Checkbox',
          label: 'Tuesday',
        },
        {
          name: 'wed',
          type: 'Checkbox',
          label: 'Wednesday',
        },
        {
          name: 'thu',
          type: 'Checkbox',
          label: 'Thursday',
        },
        {
          name: 'fri',
          type: 'Checkbox',
          label: 'Friday',
        },
        {
          name: 'sat',
          type: 'Checkbox',
          label: 'Saturday',
        },
        {
          name: 'sun',
          type: 'Checkbox',
          label: 'Sunday',
        },
        'probability_id',
      ],
      title: `${entry.date}`,
      initialValues: {
        ...entry,
        startDate: entry.date,
        endDate: entry.date,
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: false,
        sun: false,
      },
      onSubmit: this.updateRosterEntry,
    });
  };

  updateRosterEntry = async entry => {
    const { RosterEntry } = this.props.$models;

    // Generate new entries
    const newEntries = [];
    for (
      let d = moment(entry.startDate).clone();
      d.isSameOrBefore(moment(entry.endDate));
      d.add(1, 'day')
    ) {
      const weekDayName = d.format('ddd').toLowerCase();
      if (entry[weekDayName]) {
        // Only pick chosen weekdays
        newEntries.push({
          date: d.format('YYYY-MM-DD'),
          consultant_id: this.props.consultant_id,
          project_id: entry.project_id,
          probability_id: entry.probability_id,
        });
      }
    }

    if (newEntries.length === 0) return;

    await RosterEntry.destroy({
      where: {
        consultant_id: this.props.consultant_id,
        date: {
          $in: newEntries.map(e => e.date),
        },
      },
    });

    await RosterEntry.bulkCreate(newEntries);
    await this.loadRosterEntries();
  };

  handleClose = () => {
    this.props.$popup.close();
    this.props.onClose(this.state.consultant.id);
  };

  renderTable = () => {
    const { startDate, endDate, entries } = this.state;
    const dates = datesToArray(startDate, endDate).map(date => entries[date]);
    const weeklyEntries = [];

    for (let i = 0; i <= dates.length; i += 7) {
      weeklyEntries.push(dates.slice(i, i + 7));
    }

    return weeklyEntries.map(this.renderRow);
  };

  renderRow = ({ item, index }) => {
    if (!item.length) return null;

    return (
      <Row>
        <HeaderCell>{item[0].date.substring(5)}</HeaderCell>
        {item.map(this.renderCell)}
      </Row>
    );
  };

  renderCell = entry => {
    let backgroundColor = '#f8f8f8';
    if (entry && entry.probability) {
      backgroundColor = entry.probability.backgroundColor;
    }

    let projectName = entry && entry.project && entry.project.name;

    if (projectName) projectName = truncString(projectName);

    return (
      <Cell onPress={() => this.openEntryForm(entry)} backgroundColor={backgroundColor}>
        <CellText>{projectName}</CellText>
      </Cell>
    );
  };

  render() {
    const { loading, consultant, weeklyEntries } = this.state;
    if (!consultant) {
      if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
      return <Title>No consultant specified.</Title>;
    }

    return (
      <Container>
        <CloseButton onPress={this.handleClose}>X</CloseButton>
        <Title>{consultant.name}'s Roster</Title>
        <HeaderRow>{weekdays.map(d => <HeaderCell>{d}</HeaderCell>)}</HeaderRow>
        <LoadButton onPress={() => this.loadRosterEntries(-4)}>Load previous</LoadButton>
        <FlatList data={weeklyEntries} renderItem={this.renderRow} getKey={item => item[0].date} />
        <LoadButton onPress={() => this.loadRosterEntries(12)}>Load more</LoadButton>
      </Container>
    );
  }
}

export default SingleRoster;

const Container = styled(View)`
  flex: 1;
  margin-right: 20px;
`;

const CloseButton = styled(Button)`
  font-size: 18px;
  margin: 15px;
  color: gray;
`;

const Title = styled(Text)`
  font-size: 20px;
  margin-top: 20px;
  margin-bottom: 15px;
  margin-left: 20px;
`;

const LoadButton = styled(Button)`
  box-shadow: 0 2px 4px #888888;
  border-radius: 3px;
  padding: 7px;
  margin: 10px;
  width: auto;
  text-align: center;
  align-self: center;
`;

const Row = styled(View)`
  flex: 1;
  flex-direction: row;
  height: 40px;
`;

const HeaderRow = styled(View)`
  flex-direction: row;
  text-align: center;
  height: 40px;
`;

const cellStyle = `
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const HeaderCell = styled(Text)`
  ${cellStyle};
  text-align: center;
  align-self: center;
`;

const Cell = styled(Button)`
  ${cellStyle} border: 1px solid #eee;
  background-color: ${props => props.backgroundColor};
`;

const CellText = styled(Text)`
  font-size: 12px;
`;
