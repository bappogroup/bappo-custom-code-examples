import React from 'react';
import { ActivityIndicator, FlatList, View, Text, Button, styled } from 'bappo-components';
import { dateFormat, getMonday, datesToArray } from 'utils';

const weekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function truncString(str, max = 18, add = '...') {
  add = add || '...';
  return typeof str === 'string' && str.length > max ? str.substring(0, max) + add : str;
}

class SingleRoster extends React.Component {
  state = {
    error: null,
    consultant: null,
    startDate: getMonday(),
    weeklyEntries: [], // Array of array, containing entries of each week
    endDate: null,
    loading: true,
  };

  async componentDidMount() {
    const { $models } = this.props;
    const consultant = (await $models.Consultant.findAll({
      where: {
        user_id: this.props.$global.currentUser.id,
      },
    }))[0];

    if (!consultant) {
      this.setState({ error: 'You are not linked to a consultant. Please contact your manager.' });
    } else {
      this.setState({ consultant }, () => this.loadRosterEntries());
    }
  }

  loadRosterEntries = async extraWeeks => {
    const { consultant, startDate } = this.state;
    this.setState({ loading: true });

    // Fetch entries: 12 weeks from today
    const endDate =
      this.state.endDate ||
      startDate
        .clone()
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
          $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
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
      const date = d.format(dateFormat);
      if (!entries[date]) entries[date] = { date };
    }

    // Group entries by week
    const entriesByDate = datesToArray(startDate, endDate).map(
      date => entries[date.format(dateFormat)],
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

  renderRow = ({ item }) => {
    if (!item.length) return null;

    return (
      <Row>
        <HeaderCell>{item[0].date.substring(5)}</HeaderCell>
        {item.map(this.renderCell)}
      </Row>
    );
  };

  renderCell = entry => {
    let projectName = entry && entry.project && entry.project.name;

    if (projectName) projectName = truncString(projectName);

    return (
      <Cell onPress={() => this.openEntryForm(entry)}>
        <CellText>{projectName}</CellText>
      </Cell>
    );
  };

  render() {
    const { loading, consultant, weeklyEntries, error } = this.state;

    if (error) return <Title>{error}</Title>;

    if (!consultant) {
      if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
      return <Title>No consultant specified.</Title>;
    }

    return (
      <Container>
        <Title>{consultant.name}'s Roster</Title>
        <HeaderRow>{weekdays.map(d => <HeaderCell>{d}</HeaderCell>)}</HeaderRow>
        <LoadButton onPress={() => this.loadRosterEntries(-4)}>Load previous</LoadButton>
        <FlatList data={weeklyEntries} renderItem={this.renderRow} keyExtractor={item => item.id} />
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
  text-align: center;
  align-self: center;
  ${cellStyle};
`;

const Cell = styled(Button)`
  border: 1px solid #eee;
  ${cellStyle};
`;

const CellText = styled(Text)`
  font-size: 12px;
`;
