import React from 'react';
import moment from 'moment';
import { ActivityIndicator, FlatList, View, Text, Button, styled } from 'bappo-components';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import { dateFormat, getMonday, daysDisplayed, datesToArrayByStart, datesEqual } from 'utils';
import SingleRoster from './SingleRoster';

function truncString(str, max = 5, add = '...') {
  return typeof str === 'string' && str.length > max ? str.substring(0, max) + add : str;
}

class Roster extends React.Component {
  state = {
    costCenter: null,
    startDate: getMonday(),
    loading: true,
    consultants: [],
  };

  async componentDidMount() {
    const { $models, $global } = this.props;

    // Load user preferences
    const prefs = await getUserPreferences($global.currentUser.id, $models);
    const { costCenter_id } = prefs;

    if (costCenter_id) {
      const costCenter = await $models.CostCenter.findById(costCenter_id);
      this.setState({ costCenter }, () => this.loadData());
    } else {
      this.loadData();
    }
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
        startDate: this.state.startDate || moment().format(dateFormat),
      },
      onSubmit: async ({ costCenterId, startDate }) => {
        const costCenter = costCenters.find(cc => cc.id === costCenterId);

        this.setState(
          {
            costCenter,
            startDate,
          },
          () => this.loadData(),
        );

        setUserPreferences(this.props.$global.currentUser.id, $models, {
          costCenter_id: costCenter.id,
        });
      },
    });
  };

  getListItemLayout = (_data, index) => ({
    length: 34,
    offset: 34 * index,
    index,
  });

  handleClickConsultant = consultant => {
    const projectOptions = this.state.projectAssignments
      .filter(pa => pa.consultant_id === consultant.id)
      .map(pa => ({
        id: pa.project_id,
        label: pa.project.name,
      }));

    this.props.$popup.open(
      <SingleRoster
        consultant={consultant}
        projectOptions={projectOptions}
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

  openEntryForm = async (entry, consultant) => {
    const projectOptions = this.state.projectAssignments
      .filter(pa => pa.consultant_id === consultant.id)
      .map(pa => ({
        id: pa.project_id,
        label: pa.project.name,
      }));

    this.props.$popup.form({
      objectKey: 'RosterEntry',
      fields: [
        'name',
        {
          name: 'project_id',
          label: 'Project',
          type: 'FixedList',
          properties: {
            options: projectOptions,
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
          consultant_id: entry.consultant_id,
          project_id: entry.project_id,
          probability_id: entry.probability_id,
        });
      }
    }

    if (newEntries.length === 0) return;

    await RosterEntry.destroy({
      where: {
        consultant_id: entry.consultant_id,
        date: {
          $in: newEntries.map(e => e.date),
        },
      },
    });

    await RosterEntry.bulkCreate(newEntries);
    await this.loadData();
  };

  loadData = async () => {
    const { costCenter, startDate } = this.state;
    const { Consultant, RosterEntry, ProjectAssignment } = this.props.$models;

    const consultantQuery = {
      active: true,
    };

    if (costCenter) consultantQuery.costCenter_id = costCenter.id;

    const consultants = await Consultant.findAll({
      limit: 50,
      where: consultantQuery,
      include: [],
    });

    const projectAssignments = await ProjectAssignment.findAll({
      where: {
        consultant_id: {
          $in: consultants.map(c => c.id),
        },
      },
      include: [{ as: 'project' }],
      limit: 10000,
    });

    const entries = await RosterEntry.findAll({
      where: {
        date: {
          $between: [
            moment(startDate).format(dateFormat),
            moment(startDate)
              .add(daysDisplayed, 'day')
              .format(dateFormat),
          ],
        },
        consultant_id: {
          $in: consultants.map(c => c.id),
        },
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });

    const rosterEntryMap = {};
    for (const entry of entries) {
      rosterEntryMap[`${entry.consultant_id}-${entry.date.toString()}`] = entry;
    }

    consultants.unshift({ id: 'header' });

    this.setState({
      loading: false,
      consultants,
      rosterEntryMap,
      projectAssignments,
    });
  };

  rosterKeyExtractor = (item, index) => `entry_${item.id}_${index}`;

  reloadConsultantData = async consultant_id => {
    this.setState({ loading: true });
    const { startDate } = this.state;

    const entries = await this.props.$models.RosterEntry.findAll({
      where: {
        date: {
          $between: [
            moment(startDate).format(dateFormat),
            moment(startDate)
              .add(daysDisplayed, 'day')
              .format(dateFormat),
          ],
        },
        consultant_id,
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 100000,
    });

    this.setState(state => {
      const { rosterEntryMap } = state;
      for (const entry of entries) {
        rosterEntryMap[`${entry.consultant_id}-${entry.date.toString()}`] = entry;
      }
      return {
        ...state,
        rosterEntryMap,
        loading: false,
      };
    });
  };

  renderCell = (consultant, date) => {
    const dateFormatted = date.format('YYYY-MM-DD');
    const key = `${consultant.id}-${dateFormatted}`;
    const entry = this.state.rosterEntryMap[key] || {
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
        onPress={() => this.openEntryForm(entry, consultant)}
        backgroundColor={backgroundColor}
        key={key}
      >
        <CellText>{projectName}</CellText>
      </Cell>
    );
  };

  renderEntryRow = data => {
    const { index, item } = data;
    const dates = datesToArrayByStart(this.state.startDate);

    // Render date
    if (index === 0) {
      // Show month label at first date, or beginning of month
      return (
        <Row>
          <HeaderLabel />
          {dates.map((date, dateIndex) => {
            let format = 'DD';
            let color = 'black';
            if (date.weekday() === 6 || date.weekday() === 0) color = 'lightgray';
            if (dateIndex === 0 || datesEqual(date, date.clone().startOf('month'))) {
              // Show month label
              format = 'MMM DD';
            }
            return <HeaderCell color={color}>{date.format(format)}</HeaderCell>;
          })}
        </Row>
      );
    }

    // Render normal entry
    return (
      <Row>
        <Label onPress={() => this.handleClickConsultant(item)}>
          <Text>{item.name}</Text>
        </Label>
        {dates.map(date => this.renderCell(item, date))}
      </Row>
    );
  };

  render() {
    const { loading, costCenter, consultants } = this.state;
    if (loading) {
      return <ActivityIndicator style={{ flex: 1 }} />;
    }

    return (
      <Container>
        <HeaderContainer>
          <Heading>Cost center: {(costCenter && costCenter.name) || 'all'}</Heading>
          <TextButton onPress={this.setFilters}>change</TextButton>
        </HeaderContainer>
        <StyledList
          data={consultants}
          renderItem={this.renderEntryRow}
          initialNumToRender={5}
          keyExtractor={this.rosterKeyExtractor}
          getItemLayout={this.getListItemLayout}
        />
      </Container>
    );
  }
}

export default Roster;

const Container = styled(View)`
  flex: 1;
  flex-direction: column;
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

const StyledList = styled(FlatList)`
  overflow-x: auto;
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
