import React from 'react';
import { styled, View, Text, Button } from 'bappo-components';
import BorderButton from './components/BorderButton';

const EntryDetails = ({
  entry,
  entryModel,
  fetchList,
  $popup,
}) => {
  const updateEntry = async (data) => {
    await entryModel.update(data);
    fetchList();
  }

  const deleteEntry = async () => {
    await entryModel.destroyById(entry.id);
    fetchList();
  }

  const openEditForm = () => {
    $popup.form({
      formKey: 'TimesheetEntryForm',
      initialValues: entry,
      onSubmit: updateEntry,
    });
  }

  return (
    <Container>
      <NameContainer>
        <FieldName>Notes</FieldName>
      </NameContainer>
      <ValueContainer>
        <Text>{entry.notes}</Text>
        <ButtonsContainer>
          <MarginedButton onPress={openEditForm}><Text>Edit</Text></MarginedButton>
          <BorderButton onPress={deleteEntry}><Text>Delete</Text></BorderButton>
        </ButtonsContainer>
      </ValueContainer>
    </Container>
  );
};

export default EntryDetails;

const Container = styled(View)`
  margin: 20px;
  flex-direction: row;
`;

const NameContainer = styled(View)`
  flex-basis: 30%;
  align-items: flex-end;
`;

const FieldName = styled(Text)`
  font-weight: bold;
  margin-right: 20px;
`;

const ValueContainer = styled(View)`
  flex-basis: 70%;
`;

const ButtonsContainer = styled(View)`
  flex-direction: row;
  margin-top: 20px;
`;

const MarginedButton = styled(BorderButton)`
  margin-right: 15px;
`;
