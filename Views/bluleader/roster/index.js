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
import SingleRoster from './SingleRoster';

const {
  getMonday,
  daysDisplayed,
  datesToArray,
  datesToArrayByStart,
  datesEqual,
} = utils;

function truncString(str, max = 5, add = '...') {
  add = add || '...';
  return typeof str === 'string' && str.length > max
    ? str.substring(0, max) + add
    : str;
}

class Roster extends React.Component {
  state = {
    costCenter: null,
    startDate: getMonday(),
    loading: true,
    consultants: [],
  };

  componentDidMount() {
    this.loadData();
  }

  // Bring up a popup asking which cost centre and start time
  setFilters = async () => {
    const { $models, $popup } = this.props;

    const costCenters = await $models.CostCenter.findAll({
      limit: 1000,
    });
    const costCenterOptions = costCenters.map(cc => ({
      id: cc.id,
      label: cc.name,
    }));

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
          type: 'Date',
          properties: {},
        },
      ],
      initialValues: {
        costCenterId: this.state.costCenter && this.state.costCenter.id,
        startDate: this.state.startDate || moment().toDate(),
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
    const { Consultant, RosterEntry } = this.props.$models;

    const consultantQuery = {
      active: true,
    };

    if (costCenter) consultantQuery.costCenter_id = costCenter.id;

    const consultants = await Consultant.findAll({
      limit: 10000,
      where: consultantQuery,
      include: [],
    });

    const entries = await RosterEntry.findAll({
      where: {
        date: {
          $between: [
            moment(startDate).toDate(),
            moment(startDate)
              .add(daysDisplayed, 'day')
              .toDate(),
          ],
        },
        consultant_id: {
          $in: consultants.map(c => c.id),
        },
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });

    const map1 = {};
    for (const entry of entries) {
      map1[`${entry.consultant_id}-${entry.date.toString()}`] = entry;
    }

    this.setState({
      loading: false,
      consultants,
      map1,
      // probability,
    });
  };

  reloadConsultantData = async consultant_id => {
    this.setState({ loading: true });
    const { startDate } = this.state;

    const entries = await this.props.$models.RosterEntry.findAll({
      where: {
        date: {
          $between: [
            moment(startDate).toDate(),
            moment(startDate)
              .add(daysDisplayed, 'day')
              .toDate(),
          ],
        },
        consultant_id,
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });

    this.setState(state => {
      const { map1 } = state;
      for (const entry of entries) {
        map1[`${entry.consultant_id}-${entry.date.toString()}`] = entry;
      }
      return {
        ...state,
        map1,
        loading: false,
      };
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
      consultant_id: entry.consultant_id,
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

    await RosterEntry.bulkCreate(newEntries);
    await this.loadData();
  };

  handleClickConsultant = consultant => {
    this.props.$popup.open(
      <SingleRoster
        consultant_id={consultant.id}
        {...this.props}
        onClose={this.reloadConsultantData}
      />,
      {
        style: {
          width: Infinity,
          height: Infinity,
        },
      },
    );
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

  renderConsultantLabel = data => {
    const { index, item } = data;
    if (index === 0) return <HeaderLabel />;

    return (
      <Label onPress={() => this.handleClickConsultant(item)}>
        <Text>{item.name}</Text>
      </Label>
    );
  };

  renderEntries = data => {
    const { index, item } = data;
    const dates = datesToArrayByStart(this.state.startDate);

    // Render date
    if (index === 0) {
      // Show month label at first date, or beginning of month
      return (
        <Row>
          {dates.map((date, dateIndex) => {
            let format = 'DD';
            let color = 'black';
            if (date.weekday() === 6 || date.weekday() === 0)
              color = 'lightgray';
            if (
              dateIndex === 0 ||
              datesEqual(date, date.clone().startOf('month'))
            ) {
              // Show month label
              format = 'MMM DD';
            }
            return <HeaderCell color={color}>{date.format(format)}</HeaderCell>;
          })}
        </Row>
      );
    }

    // Render normal entry
    return <Row>{dates.map(date => this.renderCell(item, date))}</Row>;
  };

  render() {
    const { loading, costCenter, consultants } = this.state;
    if (loading) {
      return <ActivityIndicator style={{ flex: 1 }} />;
    }

    const consultantsWithHeader = [{ id: 'header' }].concat(consultants);

    return (
      <Container>
        <HeaderContainer>
          <Heading>
            Cost center: {(costCenter && costCenter.name) || 'all'}
          </Heading>
          <TextButton onPress={this.setFilters}>change</TextButton>
        </HeaderContainer>
        <ListContainer>
          <ConsultantList
            data={consultantsWithHeader}
            renderItem={this.renderConsultantLabel}
          />
          <EntryList
            data={consultantsWithHeader}
            renderItem={this.renderEntries}
            getItemLayout={(_data, index) => ({
              length: 34,
              offset: 34 * index,
              index,
            })}
          />
        </ListContainer>
      </Container>
    );
  }
}

export default Roster;

const Container = styled(View)`
  flex: 1;
`;

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

const ListContainer = styled(View)`
  flex: 1;
  flex-direction: row;
  overflow-y: auto;
`;

const ConsultantList = styled(FlatList)`
  width: 125px;
  flex: none;
  overflow: visible;
`;

const EntryList = styled(FlatList)`
  flex: 1;
  overflow-y: hidden;
  overflow-x: scroll;
`;

const Row = styled(View)`
  flex-direction: row;
  height: 30px;
  margin: 2px;
`;

const labelStyle = `
  flex: none;
  width: 120px;
  height: 30px;
  margin: 1px;
`;

const HeaderLabel = styled(View)`
  ${labelStyle};
  margin: 2px;
`;

const Label = styled(Button)`
  ${labelStyle} justify-content: center;
  align-items: center;
  border: 1px solid #eee;
  margin: 2px;
`;

const cellStyle = `
  margin-left: 2px;
  margin-right: 2px;
  width: 40px;
  height: 30px;
  justify-content: center;
  align-items: center;
`;

const HeaderCell = styled(View)`
  ${cellStyle};
  color: ${props => props.color};
`;

const Cell = styled(Button)`
  ${cellStyle} border: 1px solid #eee;
  background-color: ${props => props.backgroundColor};
`;

const CellText = styled(Text)`
  font-size: 8pt;
`;
