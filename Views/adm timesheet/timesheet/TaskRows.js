import React from 'react';
import moment from 'moment';
import {
  styled,
  View,
  Button,
  Text,
  ActivityIndicator,
} from 'bappo-components';
import { timesheetEntryFormConfig } from 'utils';
import TaskPicker from './TaskPicker';
import EntryDetails from './EntryDetails';
import FlatButton from './FlatButton';

class TaskRows extends React.Component {
  state = {
    // Tasks dictionary: id-instance pairs
    tasks: {},
    entries: [],
    entryMap: [],
    loading: true,
    selectedEntry: null,
  };

  async componentWillMount() {
    const { $navigation, $models } = this.props;
    const { templateTimesheetId } = $navigation.state.params;

    if (templateTimesheetId) {
      // pre-fill tasks from template timesheet
      const tasks = {};
      const entries = await $models.TimesheetEntry.findAll({
        where: {
          timesheet_id: templateTimesheetId,
        },
        include: [{ as: 'task' }],
      });
      entries.forEach(entry => {
        if (!tasks[entry.task.id]) {
          tasks[entry.task.id] = entry.task;
        }
      });
      this.setState({ tasks }, () => this.fetchList());
    } else {
      this.fetchList();
    }
  }

  fetchList = async () => {
    const { $models, timesheet } = this.props;

    this.setState({ loading: true });

    // Fetch Entries
    const entries = await $models.TimesheetEntry.findAll({
      where: {
        timesheet_id: timesheet.id,
      },
      include: [{ as: 'task' }],
    });

    // Set new state
    this.setState(state => {
      const { tasks } = state;
      const entryMap = [];

      // Initialize based on previously populated tasks
      Object.keys(tasks).forEach(taskId => {
        if (!entryMap[taskId]) entryMap[taskId] = [];
      });

      // Build entry map and track all involved tasks
      entries.forEach(e => {
        const dow = moment(e.date).day();
        if (!entryMap[e.task_id]) {
          entryMap[e.task_id] = [];
          tasks[e.task_id] = e.task;
        }
        entryMap[e.task_id][dow] = e;
      });

      return {
        ...state,
        entryMap,
        entries,
        tasks,
        loading: false,
      };
    });
  };

  handleClickCell = (id, dayOfWeek, taskId) => {
    if (id) {
      // select an entry
      const selectedEntry = this.state.entries.find(e => e.id === id);
      this.setState({ selectedEntry });
    } else {
      // add new entry
      const { timesheet, $popup, employee } = this.props;
      const date = moment(timesheet.week)
        .add(dayOfWeek - 1, 'day')
        .format('YYYY-MM-DD');
      const task = this.state.tasks[taskId];

      $popup.form({
        ...timesheetEntryFormConfig,
        title: `${task.name}, ${date}, ${employee.name}`,
        initialValues: {
          timesheet_id: timesheet.id,
          task_id: taskId,
          date,
        },
        onSubmit: async data => {
          await this.props.$models.TimesheetEntry.create(data);
          this.fetchList();
        },
      });

      this.setState({ selectedEntry: null });
    }
  };

  handleAddTask = async () => {
    const { $models, $popup } = this.props;

    // Add new task to state
    const addTaskRow = task => {
      if (!task) return;

      this.setState(state => {
        const { tasks, entryMap } = state;
        if (!entryMap[task.id]) {
          entryMap[task.id] = [];
        }
        tasks[task.id] = task;
        return {
          ...state,
          tasks,
          entryMap,
        };
      });
    };

    return $popup.open(
      <TaskPicker $popup={$popup} $models={$models} onSubmit={addTaskRow} />,
      {
        style: {
          width: 400,
          height: 300,
        },
      },
    );
  };

  handleDeleteTaskRow = async taskId => {
    const entriesToDelete = this.state.entryMap[taskId];
    const promiseArr = [];

    // Delete all related entries
    entriesToDelete.forEach(entry => {
      if (entry) {
        promiseArr.push(
          this.props.$models.TimesheetEntry.destroyById(entry.id),
        );
      }
    });
    await Promise.all(promiseArr);

    // Remove the task row
    this.setState(
      state => {
        const { tasks } = state;
        delete tasks[taskId];
        return {
          ...state,
          tasks,
        };
      },
      () => this.fetchList(),
    );
  };

  renderTaskRow = task => {
    let total = 0;
    return (
      <TaskRowContainer key={task.name}>
        <RowCell>
          <DeleteTaskButton
            onPress={() => this.handleDeleteTaskRow(parseInt(task.id, 10))}
          >
            <DeleteButtonText>x</DeleteButtonText>
          </DeleteTaskButton>
          <LargerText>{task.name}</LargerText>
        </RowCell>
        {Array.from({ length: 5 }, (v, i) => i + 1).map(dow => {
          const entry = this.state.entryMap[task.id][dow];
          let hourOfDay;
          if (entry) {
            hourOfDay = Number(entry.hours);
            total += hourOfDay;
          }

          return (
            <TaskCell key={`${task.id}_${dow}`}>
              <StyledButton
                hasValue={!!entry}
                onPress={() =>
                  this.handleClickCell(entry && entry.id, dow, task.id)
                }
              >
                <LargerText>
                  {typeof hourOfDay === 'undefined' ? 'Add' : hourOfDay}
                </LargerText>
              </StyledButton>
            </TaskCell>
          );
        })}
        <Cell>
          <LargerText>{total}</LargerText>
        </Cell>
      </TaskRowContainer>
    );
  };

  renderTotalRow = () => {
    const { tasks, entryMap } = this.state;
    let weekTotal = 0;

    return (
      <TaskRowContainer>
        <Cell>
          <LargerText>Total</LargerText>
        </Cell>
        {Array.from({ length: 5 }, (v, i) => i + 1).map(dow => {
          let dayTotal = 0;
          Object.keys(tasks).forEach(taskId => {
            const entry = entryMap[taskId][dow];
            if (entry) {
              dayTotal += Number(entry.hours);
              weekTotal += Number(entry.hours);
            }
          });

          return (
            <Cell key={`${dow}_total`}>
              <LargerText>{dayTotal}</LargerText>
            </Cell>
          );
        })}
        <Cell>
          <LargerText>{weekTotal}</LargerText>
        </Cell>
      </TaskRowContainer>
    );
  };

  render() {
    const { tasks, selectedEntry, loading } = this.state;
    const { $popup, $models, employee } = this.props;

    if (loading) return <ActivityIndicator />;

    return (
      <Container>
        {Object.keys(tasks).map(taskId => this.renderTaskRow(tasks[taskId]))}
        {this.renderTotalRow()}
        {selectedEntry && (
          <EntryDetails
            employee={employee}
            entry={selectedEntry}
            entryModel={$models.TimesheetEntry}
            fetchList={this.fetchList}
            $popup={$popup}
          />
        )}
        <NewTaskButton onPress={this.handleAddTask}>
          <LargerText>New Task</LargerText>
        </NewTaskButton>
      </Container>
    );
  }
}

export default TaskRows;

const Container = styled(View)``;

const TaskRowContainer = styled(View)`
  flex-direction: row;
  align-items: center;
`;

const Cell = styled(View)`
  margin: 5px;
  flex: 1;
  align-items: center;
`;

const RowCell = styled(View)`
  margin: 5px;
  flex: 1;
  flex-direction: row;
  justify-content: center;
`;

const TaskCell = styled(Cell)`
  background-color: #eee;
  &:hover {
    > div {
      opacity: 0.7;
    }
  }
`;

const StyledButton = styled(Button)`
  align-self: stretch;
  align-items: center;
  ${props => !props.hasValue && 'opacity: 0;'};
`;

const DeleteTaskButton = styled(Button)`
  margin-right: 5px;
`;

const DeleteButtonText = styled(Text)`
  color: red;
`;

const LargerText = styled(Text)`
  font-size: 18px;
`;

const NewTaskButton = styled(FlatButton)`
  width: 100px;
  margin: 30px;
  align-self: center;
`;
