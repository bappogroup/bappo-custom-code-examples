import React from 'react';
import { FlatList, View, Text, Button, styled } from 'bappo-components';
import dates from './dates.js';
import moment from 'moment';
const defaultFromDate = moment();
const defaultToDate = moment().add(365, 'days');

class Roster extends React.Component {
  state = {
    loading: true,
    fromDate: defaultFromDate,
    toDate: defaultToDate,
    dates: dates(defaultFromDate, defaultToDate),
  };

  renderCell = info => {
    const date = info.item.date;

    return (
      <Cell
        onPress={() => this.openEntryForm(entry)}
        backgroundColor={backgroundColor}
      >
        <CellText>{info.item.date.format('YYYYMMDD')}</CellText>
      </Cell>
    );
  };

  openEntryForm = entry => {
    this.props.$popup.form({
      objectKey: 'RosterEntry',
      fields: [
        'name',
        'job_id',
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
    const { RosterEntry } = this.props.$models;
    const newEntries = dates(
      moment(entry.startDate),
      moment(entry.endDate),
    ).map(d => {
      return {
        date: d.format('YYYY-MM-DD'),
        consultant_id: entry.consultant_id,
        job_id: entry.job_id,
        probability_id: entry.probability_id,
      };
    });
    await RosterEntry.destroy({
      where: {
        consultant_id: entry.consultant_id,
        date: [entry.startDate, entry.endDate],
      },
    });

    try {
      await RosterEntry.bulkCreate(newEntries);
    } catch (e) {
      console.log(e);
    }

    this.loadData();
  };

  loadData = async () => {
    const { RosterEntry, Probability } = this.props.$models;
    const entries = await RosterEntry.findAll({
      where: { consultant_id: this.props.consultant.id },
      include: [{ as: 'job' }, { as: 'probability' }],
      limit: 1000000,
    });

    // Create Map of Probabilities, get the list and turn it into a lookup object
    const probArray = await Probability.findAll({});
    const probability = {};
    let prob;
    for (prob of probArray) {
      probability[prob.id] = prob;
    }

    const map1 = {};
    for (var entry of entries) {
      map1[`${entry.consultant_id}-${entry.date.toString()}`] = entry;
    }

    this.setState({
      loading: false,
      map1,
      probability,
    });
  };

  componentDidMount() {
    this.loadData();
  }

  render() {
    if (this.state.loading) {
      return (
        <View>
          <Text>Loading</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={this.state.dates}
        renderItem={this.renderCell}
        initialNumToRender={10}
      />
    );
  }
}

export default Roster;

const Cell = styled(Button)`
  border: 1px solid #eee;
  margin: 3px;
  justify-content: center;
  align-items: center;
  background-color: ${props => props.backgroundColor};
`;

const CellText = styled(Text)`
  font-size: 8pt;
`;
