import React from 'react';
import moment from 'moment';
import { ActivityIndicator, View, Text, Button, styled } from 'bappo-components';
import { AutoSizer, MultiGrid } from 'react-virtualized';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import { dateFormat, datesToArray } from 'utils';
import SingleRoster from './SingleRoster';

function truncString(str, max = 5, add = '...') {
  return typeof str === 'string' && str.length > max ? str.substring(0, max) + add : str;
}

class Roster extends React.Component {
  state = {
    costCenter: null,
    startDate: moment().startOf('month'),
    endDate: moment()
      .startOf('month')
      .add(3, 'months'),
    loading: true,
    projectAssignments: {},
    entryList: [],
    consultants: [],
    consultantCount: 0,
    consultantOffset: 0,
  };

  highestRowIndex = 0;
  isLoading = false;

  async componentDidMount() {
    const { $models, $global } = this.props;
    const { startDate, endDate } = this.state;

    const consultants = await $models.Consultant.findAll();

    // Insert date array at first
    const dateArray = datesToArray(startDate, endDate).map(date => {
      let labelFormat = 'DD';
      if (date.date() === 1) labelFormat = 'MMM DD';

      return {
        formattedDate: date.format(labelFormat),
        weekday: date.format('ddd'),
        isWeekend: date.day() === 6 || date.day() === 0,
        date,
      };
    });
    dateArray.unshift('');

    await this.setState({
      entryList: [dateArray],
      consultants,
      consultantCount: consultants.length,
    });

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

  cellRenderer = ({ columnIndex, key, rowIndex, style }) => {
    const { entryList } = this.state;

    if (rowIndex > this.highestRowIndex) {
      this.highestRowIndex = rowIndex;
    }

    if (!entryList[rowIndex]) this.loadData();

    const entry = entryList[rowIndex] && entryList[rowIndex][columnIndex];

    let backgroundColor = '#f8f8f8';

    if (rowIndex === 0) {
      // Render date label cell
      let color = 'black';
      if (entry.isWeekend) color = 'grey';
      return (
        <Label key={key} style={style} backgroundColor={backgroundColor} color={color}>
          <div>{entry.weekday}</div>
          <div>{entry.formattedDate}</div>
        </Label>
      );
    } else if (columnIndex === 0) {
      // Render consultant label cell
      const consultantName = (entry && entry.name) || this.state.consultants[rowIndex].name;

      return (
        <ClickLabel
          key={key}
          style={style}
          backgroundColor={backgroundColor}
          onClick={() => this.handleClickConsultant(entry)}
        >
          {consultantName}
        </ClickLabel>
      );
    }

    // Render roster entry cell
    if (entry && entry.probability) {
      backgroundColor = entry.probability.backgroundColor;
    }
    const projectName = entry && entry.project && entry.project.name;

    return (
      <Cell
        key={key}
        style={style}
        backgroundColor={backgroundColor}
        onPress={() => this.openEntryForm(rowIndex, columnIndex, entry)}
      >
        {projectName}
      </Cell>
    );
  };

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

  openEntryForm = async (rowIndex, columnIndex, entry) => {
    const { consultants, entryList } = this.state;
    const consultant = consultants[rowIndex - 1];
    const date = entryList[0][columnIndex].date.format(dateFormat);
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
      title: `${consultant.name}, ${date}`,
      initialValues: {
        ...entry,
        consultant_id: consultant.id,
        startDate: date,
        endDate: date,
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
    await this.reloadConsultantData(entry.consultant_id);
  };

  loadData = async () => {
    const {
      costCenter,
      startDate,
      endDate,
      consultants,
      consultantOffset,
      projectAssignments,
      entryList,
    } = this.state;
    const { RosterEntry, ProjectAssignment } = this.props.$models;

    if (this.isLoading) return;
    this.isLoading = true;

    const consultantQuery = {
      active: true,
    };
    const newConsultantOffset = consultantOffset + 10;

    if (costCenter) consultantQuery.costCenter_id = costCenter.id;

    const newConsultants = consultants.slice(consultantOffset, newConsultantOffset);

    // Build map between id and consultant
    const consultantMap = {};
    newConsultants.forEach(c => {
      consultantMap[c.id] = c;
    });

    const newProjectAssignments = await ProjectAssignment.findAll({
      where: {
        consultant_id: {
          $in: newConsultants.map(c => c.id),
        },
      },
      include: [{ as: 'project' }],
      limit: 1000,
    });

    const rosterEntries = await RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
        },
        consultant_id: {
          $in: newConsultants.map(c => c.id),
        },
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 1000,
    });

    const tempMap = {};

    rosterEntries.forEach(entry => {
      if (!tempMap[entry.consultant_id]) tempMap[entry.consultant_id] = [];
      const entryIndex = moment(entry.date).diff(startDate, 'days');
      tempMap[entry.consultant_id][entryIndex] = entry;
    });

    // Insert consultant name at first of roster entry array
    const newEntryList = Object.entries(tempMap).map(([key, value]) => {
      const consultant = consultantMap[key];
      return [consultant, ...value];
    });

    this.setState({
      loading: false,
      entryList: [...entryList, ...newEntryList],
      projectAssignments: [...projectAssignments, ...newProjectAssignments],
      consultantOffset: newConsultantOffset,
    });
    this.isLoading = false;

    this.gridRef.recomputeGridSize();
    if (newConsultantOffset < this.highestRowIndex) {
      this.loadData();
    }
  };

  reloadConsultantData = async consultant_id => {
    const { startDate, endDate, consultants } = this.state;

    const rosterEntries = await this.props.$models.RosterEntry.findAll({
      where: {
        date: {
          $between: [startDate.format(dateFormat), endDate.format(dateFormat)],
        },
        consultant_id,
      },
      include: [{ as: 'project' }, { as: 'probability' }],
      limit: 1000,
    });

    const rowIndex = consultants.findIndex(c => c.id === consultant_id);
    const consultant = consultants[rowIndex];

    const newEntriesArr = [];
    rosterEntries.forEach(entry => {
      const entryIndex = moment(entry.date).diff(startDate, 'days');
      newEntriesArr[entryIndex] = entry;
    });
    newEntriesArr.unshift(consultant);

    this.setState(
      ({ entryList }) => {
        const newEntryList = entryList.slice();
        newEntryList[rowIndex + 1] = newEntriesArr;
        return { entryList: newEntryList, loading: false };
      },
      () => this.gridRef.recomputeGridSize({ rowIndex }),
    );
  };

  render() {
    const { loading, consultantCount, costCenter, entryList } = this.state;
    if (loading) {
      return <ActivityIndicator style={{ flex: 1 }} />;
    }

    return (
      <Container>
        <HeaderContainer>
          <Heading>Cost center: {(costCenter && costCenter.name) || 'all'}</Heading>
          <TextButton onPress={this.setFilters}>change</TextButton>
        </HeaderContainer>
        <AutoSizer>
          {({ height, width }) => (
            <MultiGrid
              width={width}
              height={height}
              fixedColumnCount={1}
              fixedRowCount={1}
              cellRenderer={this.cellRenderer}
              columnCount={entryList[0].length}
              columnWidth={120}
              rowCount={consultantCount}
              rowHeight={30}
              ref={ref => {
                this.gridRef = ref;
              }}
            />
          )}
        </AutoSizer>
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
  margin-right: 20px;
`;

const baseStyle = `
  margin-left: 2px;
  margin-right: 2px;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  font-size: 12px;
`;

const Label = styled.div`
  ${baseStyle};
  display: flex;
  flex-direction: column;
  color: ${props => props.color || 'black'};
`;

const ClickLabel = styled(Label)`
  &:hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const Cell = styled(Button)`
  ${baseStyle} border: 1px solid #eee;
  background-color: ${props => props.backgroundColor};
  ${props => (props.blur ? 'filter: blur(3px); opacity: 0.5;' : '')};
`;
