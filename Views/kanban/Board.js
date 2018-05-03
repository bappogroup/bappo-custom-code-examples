import React from 'react';
import { styled, Button, Text, View } from 'bappo-components';
import List from './List';
import MenuBar from './MenuBar';

class Board extends React.Component {
  state = {
    issuesById: {},
    issuesByStatus: {},
    selectedIssueId: null,
    searchValue: '',
  };

  componentDidMount() {
    this.fetchIssues();
  }

  fetchIssues = async () => {
    const { $models, $navigation } = this.props;
    const projectId = $navigation.state.params && $navigation.state.params.recordId;
    const where = projectId ? { project_id: projectId } : {};
    const issues = await $models.Issue.findAll({
      include: [{ as: 'assignedTo' }],
      where,
      limit: 10000,
    });
    const issuesById = {};
    const issuesByStatus = {};
    issues.forEach(issue => {
      issuesById[issue.id] = issue;
      if (!issuesByStatus[issue.status]) {
        issuesByStatus[issue.status] = [];
      }
      issuesByStatus[issue.status].push(issue);
    });

    Object.keys(issuesByStatus).forEach((key, index) => {
      issuesByStatus[key].sort((a, b) => {
        return (a.id - b.id) || a.name.localeCompare(b.name);
      });
    });

    this.setState({
      issuesById,
      issuesByStatus,
    });
  };

  changeSelectedIssueStatus = async status => {
    const { $models, $popup } = this.props;
    await $models.Issue.updateOne({
      id: this.state.selectedIssueId,
      status,
    });
    $popup.close();
    await this.fetchIssues();
  };

  createIssue = async issue => {
    const { $models } = this.props;
    await $models.Issue.create(issue);
    await this.fetchIssues();
  };

  updateIssue = async issue => {
    const { $models } = this.props;
    await $models.Issue.updateOne(issue);
    await this.fetchIssues();
  };

  openNewIssueForm = () => {
    const { $global, $navigation, $popup } = this.props;
    const currentUserId = $global.currentUser && $global.currentUser.id;
    const projectId = $navigation.state.params && $navigation.state.params.recordId;
    $popup.form({
      formKey: 'IssueForm',
      initialValues: {
        project_id: projectId,
        requestedBy_id: currentUserId,
      },
      onSubmit: this.createIssue,
    });
  };

  openEditIssueForm = () => {
    if (!this.state.selectedIssueId) return;
    const { $popup } = this.props;
    $popup.form({
      formKey: 'IssueForm',
      initialValues: this.state.issuesById[this.state.selectedIssueId],
      onSubmit: this.updateIssue,
    });
  };

  openIssueDetailsPage = () => {
    if (!this.state.selectedIssueId) return;
    const { $navigation } = this.props;
    $navigation.navigate('IssueDetailsPage', {
      recordId: this.state.selectedIssueId,
    });
  };

  openWorkflowPopup = () => {
    const { $models, $popup } = this.props;
    const statusField = $models.Issue.fields.find(field => field.name === 'status');
    const statusNames = statusField.properties.options.map(({ label }) => label);
    const selectedIssue = this.state.issuesById[this.state.selectedIssueId];
    $popup.open(
      <PopupContainer>
        {statusField.properties.options.map(({ id, label }) => {
          const isSelected = selectedIssue.status === id;
          return (
            <PopupRow
              key={id}
              disabled={isSelected}
              onPress={() => this.changeSelectedIssueStatus(id)}
            >
              <TickContainer>{isSelected ? '✓' : ''}</TickContainer>
              <PopupText>{label}</PopupText>
            </PopupRow>
          );
        })}
      </PopupContainer>,
      {
        style: {
          height: 180,
          width: 150,
        },
      },
    );
  };

  selectIssue = issue => {
    if(this.state.selectedIssueId === issue.id){
      this.openEditIssueForm();
    }else{
      this.setState({
        selectedIssueId: issue.id,
      });
    }
  };

  render() {
    const { $models } = this.props;
    const { Issue } = $models;
    const statusField = Issue.fields.find(field => field.name === 'status');
    return (
      <BoardContainer>
        <MenuBar
          detailsDisabled={!this.state.selectedIssueId}
          editDisabled={!this.state.selectedIssueId}
          openNewIssueForm={this.openNewIssueForm}
          openEditIssueForm={this.openEditIssueForm}
          openIssueDetailsPage={this.openIssueDetailsPage}
          openWorkflowPopup={this.openWorkflowPopup}
          searchValue={this.state.searchValue}
          changeSearchValue={searchValue => this.setState({ searchValue })}
        />
        <Grid>
          {statusField.properties.options.map(({ id, label }) => (
            <List
              key={id}
              issues={this.state.issuesByStatus[id] || []}
              onCardSelect={this.selectIssue}
              selectedIssueId={this.state.selectedIssueId}
              statusName={label}
              searchValue={this.state.searchValue}
            />
          ))}
        </Grid>
      </BoardContainer>
    );
  }
}

export default Board;

const BoardContainer = styled(View)`
  height: 100%;
  width: 100%;
`;

const Grid = styled(View)`
  flex: 1;
  flex-direction: row;
  overflow: scroll;
`;

const PopupContainer = styled(View)``;

const PopupRow = styled(Button)`
  align-items: center;
  flex-direction: row;
  height: 30px;
  padding: 5px;
`;

const PopupText = styled(Text)``;

const TickContainer = styled(Text)`
  margin-right: 5px;
  width: 10px;
`;
