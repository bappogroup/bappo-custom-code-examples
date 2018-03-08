import React from 'react';
import { FlatList, View, Text, Button, styled } from 'bappo-components';
import dates from './dates.js';
import moment from 'moment';
const defaultFromDate = moment();
const defaultToDate = moment().add(10, 'days');

class Roster extends React.Component {
  state = {
    costCenter: null,
    startDate: null,
    loading: true,
    consultants: [],
    fromDate: defaultFromDate,
    toDate: defaultToDate,
    dates: dates(defaultFromDate, defaultToDate),
  };

  componentDidMount() {
    this.loadData();
  }

  // Bring up a popup asking which cost centre and start time
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { costCenter, startDate } = this.state;

    const costCenters = await $models.CostCenter.findAll({
      limit: 1000,
    });
    const costCenterOptions = costCenters.map(cc => ({
      id: cc.id,
      label: cc.name,
    }));

    // TODO: type Date doesn't work!
    $popup.form({
      fields: [
        {
          name: 'costCenterId',
          label: 'Cost Center',
          type: 'FixedList',
          properties: {
            options: costCenterOptions,
          },
        },
        {
          name: 'startDate',
          label: 'Start Date',
          type: 'Text',
        },
      ],
      initialValues: {
        costCenterId: costCenter && costCenter.id,
        startDate: startDate || moment().toDate(),
      },
      onSubmit: async ({ costCenterId, startDate }) => {
        const costCenter = costCenters.find(cc => cc.id === costCenterId);
        await this.setState({
          costCenter,
          startDate,
        });
        await this.loadData();
      },
    });
  };

  loadData = async () => {
    const { costCenter, startDate } = this.state;
    const { Consultant, RosterEntry, Probability } = this.props.$models;

    //
    const consultants = await Consultant.findAll({
      limit: 10000,
      where: {
        active: true,
      },
      include: [],
    });
    const entries = await RosterEntry.findAll({
      where: {},
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 100000,
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
      consultants,
      map1,
      probability,
    });
  };

  renderCell = (consultant, date) => {
    const dateFormatted = date.format('YYYY-MM-DD');
    const key = `${consultant.id}-${dateFormatted}`;
    const entry = this.state.map1[key] || {
      date: dateFormatted,
      consultant_id: consultant.id,
    };
    let backgroundColor = '#f8f8f8';
    if (entry && entry.probability) {
      backgroundColor = entry.probability.backgroundColor;
    }

    return (
      <Cell
        onPress={() => this.openEntryForm(entry)}
        backgroundColor={backgroundColor}
      >
        <CellText>{entry && entry.project && entry.project.name}</CellText>
      </Cell>
    );
  };

  renderConsultant = info => {
    const consultant = info.item;
    return (
      <Row>
        <ConsultantLabel>
          <Text>{consultant.name}</Text>
        </ConsultantLabel>
        {this.state.dates.map(date => this.renderCell(consultant, date))}
      </Row>
    );
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

  calculateRevenue = (consultant_id, project_id) => {
    return '1234.56';
  };

  updateRosterEntry = async entry => {
    const { RosterEntry, ProjectAssignment } = this.props.$models;

    const pa = await ProjectAssignment.findAll({
      where: {
        consultant_id: entry.consultant_id,
        project_id: entry.project_id,
      },
    });

    let revenue = pa && pa.length > 0 ? pa[0].dayRate : 0;
    revenue = Math.floor(revenue);

    const newEntries = dates(
      moment(entry.startDate),
      moment(entry.endDate),
    ).map(d => {
      return {
        date: d.format('YYYY-MM-DD'),
        consultant_id: entry.consultant_id,
        project_id: entry.project_id,
        probability_id: entry.probability_id,
        revenue,
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

    await this.loadData();
  };

  render() {
    const { loading, costCenter, startDate } = this.state;
    if (loading) {
      return (
        <View>
          <Text>Loading</Text>
        </View>
      );
    }

    return (
      <Container>
        <HeaderContainer>
          <Heading>
            Cost center: {(costCenter && costCenter.name) || 'all'}
          </Heading>
          <TextButton onPress={this.setFilters}>change</TextButton>
        </HeaderContainer>
        <FlatList
          windowSize={1}
          data={this.state.consultants}
          renderItem={this.renderConsultant}
          getItemLayout={(_data, index) => ({
            length: 34,
            offset: 34 * index,
            index,
          })}
        />
      </Container>
    );
  }
}

export default Roster;

const Container = styled(View)``;

const HeaderContainer = styled(View)`
  flex-direction: row;
  align-items: center;
  margin: 20px;
`;

const Heading = styled(Text)`
  font-size: 18px;
  margin-right: 15px;
`;

const TextButton = styled(Button)`
  color: grey;
`;

const Row = styled(View)`
  flex-direction: row;
  height: 30px;
  margin: 2px;
`;

const Cell = styled(Button)`
  border: 1px solid #eee;
  margin: 2px;
  width: 40px;
  height: 30px;
  justify-content: center;
  align-items: center;
  background-color: ${props => props.backgroundColor};
`;

const ConsultantLabel = styled(View)`
  flex: none;
  width: 120px;
  height: 30px;
  justify-content: center;
  align-items: center;
  border: 1px solid #eee;
  margin: 1px;
`;

const CellText = styled(Text)`
  font-size: 8pt;
`;
