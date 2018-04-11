import { styled } from 'bappo-components';

export const Container = styled.div`
  margin-top: 50px;
  overflow-y: scroll;
  ${props => (props.blur ? 'filter: blur(3px); opacity: 0.5;' : '')};
`;

export const TableContainer = styled.div`
  display: flex;
`;

export const LabelColumnContainer = styled.div`
  flex: none;
  width: 180px;
  padding-left: 30px;
`;

export const DataRowsContainer = styled.div`
  flex: 1;
  overflow-x: scroll;
`;

export const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

export const Space = styled.div`
  height: 50px;
`;

export const Loading = styled.div`
  color: #ddd;
  margin-top: 50px;
  display: flex;
  justify-content: center;
`;

export const HeaderContainer = styled.div`
  margin: 30px;
  margin-top: 0;
  display: flex;
`;

export const TextButton = styled.span`
  font-size: 13px;
  color: grey;
  margin-left: 20px;
  margin-top: 3px;

  &:hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

export const Heading = styled.div`
  font-size: 18px;
`;

export const YearLabel = styled.div`
  position: absolute;
  bottom: 19px;
  font-weight: lighter;
  font-size: 12px;
`;

export const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  height: 30px;
`;

export const HeaderRow = styled(Row)`
  border: none;
  color: gray;
  font-weight: bold;
`;

export const RowLabel = styled.div`
  height: 30px;
  display: flex;
  align-items: center;
`;

export const Cell = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 120px;
  border-top: 1px solid #eee;
`;

export const ClickableCell = styled(Cell)`
  &: hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

export const BoldCell = styled(Cell)`
  font-weight: bold;
  border-top: 1px solid black;
  border-bottom: 1px solid black;
`;

export const SaveButton = styled.div`
  color: white;
  border-radius: 3px;
  background-color: orange;
  height: 40px;
  padding: 0px 40px;
  cursor: pointer;
  float: right;
  margin: 20px 30px;
  display: flex;
  align-items: center;
  &:hover {
    opacity: 0.7;
  }
`;
