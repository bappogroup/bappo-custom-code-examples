import React from 'react';
import moment from 'moment';
import {
  ActivityIndicator,
  FlatList,
  View,
  Text,
  Button,
  styled,
} from 'bappo-components';
import utils from 'utils';

const weekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const {
  getMonday,
  // daysDisplayed,
  datesToArray,
  // datesToArrayByStart,
  // datesEqual,
} = utils;

function truncString(str, max = 18, add = '...') {
  add = add || '...';
  return typeof str === 'string' && str.length > max
    ? str.substring(0, max) + add
    : str;
}

class SingleRoster extends React.Component {
  state = {
    startDate: null,
    endDate: null,
    loading: true,
    consultant: null,
    entries: {},
    weeklyEntries: [],
  };

  async componentWillMount() {
    const { $navigation, $models } = this.props;
    if (!$navigation.state.params) return;

    const { consultant_id } = $navigation.state.params;

    const consultant = await $models.Consultant.findById(consultant_id);

    await this.setState({ consultant });
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
        'project_id',
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
        'probability_id',
      ],
      title: `${entry.date}`,
      initialValues: { ...entry, startDate: entry.date, endDate: entry.date },
      onSubmit: this.updateRosterEntry,
    });
  };

  updateRosterEntry = async entry => {
    const { RosterEntry, ProjectAssignment } = this.props.$models;
    const { consultant } = this.state;

    const pa = await ProjectAssignment.findAll({
      where: {
        consultant_id: entry.consultant_id,
        project_id: entry.project_id,
      },
    });

    let revenue = pa && pa.length > 0 ? pa[0].dayRate : 0;
    revenue = Math.floor(revenue);

    const newEntries = datesToArray(
      moment(entry.startDate),
      moment(entry.endDate),
    ).map(d => ({
      date: d.format('YYYY-MM-DD'),
      consultant_id: consultant.id,
      project_id: entry.project_id,
      probability_id: entry.probability_id,
      revenue,
    }));
    await RosterEntry.destroy({
      where: {
        consultant_id: entry.consultant_id,
        date: {
          $gte: entry.startDate,
          $lte: entry.endDate,
        },
      },
    });

    try {
      await RosterEntry.bulkCreate(newEntries);
    } catch (e) {
      console.log(e);
    }

    await this.loadRosterEntries();
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
      <Cell
        onPress={() => this.openEntryForm(entry)}
        backgroundColor={backgroundColor}
      >
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
        <Title>{consultant.name}'s Roster</Title>
        <ButtonsContainer>
          <LoadButton onPress={() => this.loadRosterEntries(-4)}>
            Load previous weeks
          </LoadButton>
          <LoadButton onPress={() => this.loadRosterEntries(12)}>
            Load following weeks
          </LoadButton>
        </ButtonsContainer>
        <HeaderRow>{weekdays.map(d => <HeaderCell>{d}</HeaderCell>)}</HeaderRow>
        <FlatList
          data={weeklyEntries}
          renderItem={this.renderRow}
          getKey={item => item[0].date}
        />
      </Container>
    );
  }
}

export default SingleRoster;

const Container = styled(View)`
  flex: 1;
  margin-right: 20px;
`;

const Title = styled(Text)`
  font-size: 20px;
  margin-top: 20px;
  margin-bottom: 15px;
  margin-left: 20px;
`;

const ButtonsContainer = styled(View)`
  flex-direction: row;
  margin-left: 20px;
  margin-bottom: 20px;
`;

const LoadButton = styled(Button)`
  border: 1px solid lightgray;
  border-radius: 3px;
  padding: 5px;
  margin-right: 7px;
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
