import React from 'react';
import {
  styled,
  View,
  Button,
  Text,
  ActivityIndicator,
  Select,
} from 'bappo-components';

class TaskPicker extends React.Component {
  state = {
    loading: false,
    projects: [],
    tasks: [],
    project_id: null,
    task_id: null,
  };

  async componentWillMount() {
    this.setState({ loading: true });

    const { Project } = this.props.$models;
    const projects = await Project.findAll({
      limit: 10000,
    });

    this.setState({ projects, loading: false });
  }

  handleSelectProject = async project_id => {
    if (!project_id) return;

    this.setState({ loading: true });

    // Fetch tasks belonging to selected project
    const tasks = await this.props.$models.Task.findAll({
      where: {
        project_id,
      },
      limit: 10000,
    });

    this.setState({ project_id, tasks, loading: false });
  };

  handleSubmit = () => {
    const task = this.state.tasks.find(t => t.id === this.state.task_id);
    this.props.onSubmit(task);
    this.props.$popup.close();
  };

  render() {
    const { loading, projects, tasks } = this.state;

    if (loading) {
      return (
        <Container>
          <ActivityIndicator />
        </Container>
      );
    }

    return (
      <Container>
        <SelectContainer>
          <SelectLabel>Project</SelectLabel>
          <Select
            onValueChange={project_id => this.handleSelectProject(project_id)}
            options={projects.map(p => ({
              label: p.name,
              value: p.id,
            }))}
            value={this.state.project_id}
          />
        </SelectContainer>
        {this.state.project_id && (
          <SelectContainer>
            <SelectLabel>Task</SelectLabel>
            <Select
              onValueChange={task_id => this.setState({ task_id })}
              options={tasks.map(t => ({
                label: t.name,
                value: t.id,
              }))}
              value={this.state.task_id}
            />
          </SelectContainer>
        )}
        <SubmitButton onPress={this.handleSubmit}>Add Task</SubmitButton>
      </Container>
    );
  }
}

export default TaskPicker;

const Container = styled(View)`
  flex: 1;
  justify-content: space-around;
`;

const SelectContainer = styled(View)`
  margin: 20px;
`;

const SelectLabel = styled(Text)`
  margin-bottom: 10px;
`;

const SubmitButton = styled(Button)`
  background-color: dodgerblue;
  color: white;
  border-radius: 5px;
  width: 90px;
  padding: 10px;
  text-align: center;
  margin: 20px;
  align-self: flex-end;
`;
