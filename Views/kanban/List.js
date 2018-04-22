import React from 'react';
import { styled, FlatList, Text, View } from 'bappo-components';
import Card from './Card';

const keyExtractor = issue => issue.id;

const List = ({ issues, onCardSelect, selectedIssueId, statusName, searchValue }) => {
  const renderCard = ({ item }) => (
    <Card issue={item} onPress={() => onCardSelect(item)} selected={selectedIssueId === item.id} />
  );

  const filteredIssues = issues.filter(issue => {
    // const text = `${issue.name} ${issue.description} ${issue.assignedTo.name} ${issue.developer.name} ` +
    //              `${issue.requestedBy.name}`;
    const searchString = searchValue.toLowerCase().trim();
    const text = `${issue.name} ${issue.description} ${issue.assignedTo && issue.assignedTo.name}`;
    return text.toLowerCase().search(searchString) > -1;
  });

  return (
    <Container>
      <ListTitleContainer>
        <Text>{statusName}</Text>
      </ListTitleContainer>
      <StyledFlatList
        data={filteredIssues}
        extraData={selectedIssueId}
        keyExtractor={keyExtractor}
        renderItem={renderCard}
      />
    </Container>
  );
};

export default List;

const Container = styled(View)`
  border-width: 0;
  border-left-width: 1px;
  border-style: solid;
  border-color: #f4f4f4;
  flex: none;
  padding-left: 10px;
  padding-right: 10px;
  width: 221px;
`;

const ListTitleContainer = styled(View)`
  align-items: center;
  flex: none;
  height: 30px;
  justify-content: center;
`;

const ListTitle = styled(Text)`
  text-align: center;
`;

const StyledFlatList = styled(FlatList)``;
