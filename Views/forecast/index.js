import React from 'react';
import { styled } from 'bappo-components';
import { getCurrentFinancialYear } from './utils';

const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const monthLabels = [
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
];

class ForecastMatrix extends React.Component {
  state = {
    loading: true,
    year: null,
    profitCentre: null,
    entries: {},
    text: 'hello',
    saving: false,
  };

  async componentDidMount() {
    await this.setFilters();
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { profitCentre, year } = this.state;

    const profitCentres = await $models.ProfitCentre.findAll({
      limit: 1000,
    });

    const profitCentreOptions = profitCentres.map(pc => ({
      id: pc.id,
      label: pc.name,
    }));

    $popup.form({
      fields: [
        {
          name: 'profitCentreId',
          label: 'Profit Centre',
          type: 'FixedList',
          properties: {
            options: profitCentreOptions,
          },
          validate: [value => (value ? undefined : 'Required')],
        },
        {
          name: 'year',
          label: 'Year',
          type: 'Year',
          validate: [value => (value ? undefined : 'Required')],
        },
      ],
      initialValues: {
        profitCentreId: profitCentre && profitCentre.id,
        year: year || getCurrentFinancialYear(),
      },
      onSubmit: async ({ profitCentreId, year }) => {
        const profitCentre = profitCentres.find(pc => pc.id === profitCentreId);
        await this.setState({
          profitCentre,
          year,
        });
        await this.loadData();
      },
    });
  };

  handleCellChange = (entry, amt) => {
    const key = getEntryKey(entry);
    const revisedEntry = {};
    const sign = amt.includes('-') ? '-' : '';
    let amount = sign + amt.replace(/[^0-9\.]+/g, '').replace(/^0+/g, '');
    revisedEntry[key] = { ...this.state.entries[key], amount, changed: true };
    const entries = { ...this.state.entries, ...revisedEntry };
    this.setState({
      entries,
      totals: this.calcTotals(entries),
    });
  };

  selectionScreen = () => {
    this.props.$popup.form({
      objectKey: 'ForecastEntry',
      fields: ['profitCentre_id'],
      title: `Select a Profit Center`,
      initialValues: {},
      onSubmit: this.updateRosterEntry,
    });
  };

  renderRow = element => {
    return (
      <Row>
        <RowLabel>
          <span>{element.name}</span>
        </RowLabel>
        {months.map(month => this.renderCell(month, element))}
      </Row>
    );
  };

  renderCell = (month, element) => {
    const key = getKey(year, month, element.id);
    const entry = this.state.entries[key];
    if (!entry) return <Cell> ... </Cell>;

    return (
      <Cell>
        <Input
          value={entry.amount}
          onChange={event => this.handleCellChange(entry, event.target.value)}
        />
      </Cell>
    );
  };

  loadData = async () => {
    const { year, profitCentre } = this.state;
    if (!(year && profitCentre)) return;

    const { ForecastEntry, ForecastElement } = this.props.$models;
    const entries_a = await ForecastEntry.findAll({
      include: [
        { as: 'profitCentre' },
        { as: 'costCentre' },
        { as: 'forecastElement' },
      ],
      limit: 100000,
      where: {
        active: true,
        financialYear: year,
        profitCentre_id: profitCentre.id,
      },
    });

    const elements = await ForecastElement.findAll({});
    const cos_elements = [];
    const rev_elements = [];
    const oh_elements = [];

    for (const element of elements) {
      switch (element.elementType) {
        case 1:
          cos_elements.push(element);
          break;
        case 2:
          rev_elements.push(element);
          break;
        case 3:
          oh_elements.push(element);
          break;
        default:
      }
    }

    const entries = {};
    for (let entry of entries_a) {
      const key = getEntryKey(entry);
      entries[key] = entry;
    }

    for (let element of elements) {
      for (let month of months) {
        const key = getKey(year, month, element.id);
        entries[key] = entries[key] || newEntry(year, month, element);
      }
    }

    this.setState({
      loading: false,
      entries,
      elements,
      cos_elements,
      rev_elements,
      oh_elements,
      totals: this.calcTotals(entries),
    });
  };

  calcTotals = entries => {
    const tot = getZeroTotals(months);

    for (let key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry.forecastElement) {
        const amt = Number(entry.amount);
        if (amt !== 0) {
          switch (entry.forecastElement.elementType) {
            case '1':
              tot.cos[entry.financialMonth] += amt;
              tot.gp[entry.financialMonth] += -amt;
              tot.np[entry.financialMonth] += -amt;
              break;
            case '2':
              tot.rev[entry.financialMonth] += amt;
              tot.gp[entry.financialMonth] += amt;
              tot.np[entry.financialMonth] += amt;
              break;
            case '3':
              tot.oh[entry.financialMonth] += amt;
              tot.np[entry.financialMonth] += -amt;
              break;
            default:
            // do nothing
          }
        }
      }
    }
    return tot;
  };

  renderTotal = (month, key) => (
    <TotalCell>{this.state.totals[key][month]}</TotalCell>
  );
  renderTotals = (key, label) => (
    <RowSubTotal>
      <RowLabel style={{ fontWeight: 'bold' }}> {label} </RowLabel>
      {months.map(month => this.renderTotal(month, key))}
    </RowSubTotal>
  );

  save = async () => {
    this.setState({ saving: true });
    const { ForecastEntry } = this.props.$models;
    const entries = Object.keys(this.state.entries)
      .map(key => this.state.entries[key])
      .map(e => {
        return {
          financialYear: e.financialYear,
          financialMonth: e.financialMonth,
          forecastElement_id: e.forecastElement_id,
          amount: e.amount,
          costCenter_id: '',
          profitCenter_id: '',
          id: e.id,
        };
      });

    const newEntries = entries.filter(e => e.newRecord === true);
    const oldEntries = entries.filter(e => e.id);

    try {
      await ForecastEntry.bulkCreate(newEntries);
      await ForecastEntry.bulkUpdate(oldEntries);
    } catch (e) {
      alert('something went wrong');
    }
    this.setState({ saving: false });
  };

  savingIndicator = () => {
    return this.state.saving ? <Saving>Saving</Saving> : null;
  };

  filterButton = <FilterButton onClick={this.setFilters}>change</FilterButton>;

  render() {
    const { loading, saving, profitCentre, year } = this.state;

    if (!profitCentre) {
      return (
        <Loading>
          Please specify a profit centre and time to continue.
          {this.filterButton}
        </Loading>
      );
    }
    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    return (
      <Container saving={saving}>
        <HeaderContainer>
          <Heading>
            Profit center: {profitCentre.name}, financial year {year}
          </Heading>
          {this.filterButton}
        </HeaderContainer>
        <HeaderRow>
          <RowLabel />
          {monthLabels.map(month => (
            <Cell>
              <HeaderLabel> {month} </HeaderLabel>{' '}
            </Cell>
          ))}
        </HeaderRow>
        {this.state.rev_elements.map(this.renderRow)}
        {this.renderTotals('rev', 'Total Revenue')}
        <Space />
        {this.state.cos_elements.map(this.renderRow)}
        {this.renderTotals('cos', 'Total Cost of Sales')}

        <Space />
        {this.renderTotals('gp', 'Gross Profit')}

        <Space />
        {this.state.oh_elements.map(this.renderRow)}
        {this.renderTotals('oh', 'Total Overheads')}

        <Space />
        {this.renderTotals('np', 'Net Profit')}

        <SaveButton onClick={this.save}> Save </SaveButton>
      </Container>
    );
  }
}

export default ForecastMatrix;

const Row = styled.div`
  padding-right: 30px;
  padding-left: 30px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  border-top: 1px solid #eee;
  line-height: 30px;
`;

const RowSubTotal = styled(Row)`
  border-top: 1px solid black;
  border-bottom: 1px solid black;
`;

const HeaderRow = styled(Row)`
  border: none;
  color: gray;
  font-weight: bold;
`;

const RowLabel = styled.div`
  flex: none;
  width: 240px;
`;

const Cell = styled.div`
  padding-left: 1px;
  padding-right: 1px;
  display: flex;
  flex-direction: row;
  flex: 1;
`;

const HeaderLabel = styled.div`
  text-align: center;
  flex: 1;
`;

const Input = styled.input`
  flex: 1;
  width: 0px;
  border: none;
  text-align: center;
  padding-right: 5px;
  font-size: 11pt;
  border-bottom: 1px solid white;
  &:focus {
    outline: none;
    border-bottom: 1px solid gray;
  }
`;

const getKey = (yr, mth, el) => `${yr}.${mth}.${el}`;

const getEntryKey = entry =>
  getKey(entry.financialYear, entry.financialMonth, entry.forecastElement_id);

const newEntry = (year, month, element) => {
  return {
    newRecord: true,
    financialYear: year,
    financialMonth: month,
    forecastElement_id: element.id,
    forecastElement: element,
    amount: '',
  };
};

const getZeroTotals = () => {
  const t = {
    cos: {},
    rev: {},
    oh: {},
    gp: {},
    np: {},
  };

  for (let month of months) {
    t.cos[month] = 0.0;
    t.rev[month] = 0.0;
    t.oh[month] = 0.0;
    t.gp[month] = 0.0;
    t.np[month] = 0.0;
  }

  return t;
};

const Container = styled.div`
  ${props =>
    props.saving ? 'filter: blur(3px); opacity: 0.5;' : ''} margin-top: 50px;
  overflow-y: scroll;
`;

const TotalCell = styled.div`
  text-align: center;
  flex: 1;
  font-weight: bold;
`;

const Space = styled.div`
  height: 50px;
`;

const HorizontalLine = styled.div`
  height: 1px;
  border-top: 1px solid black;
`;

const SaveButton = styled.div`
  color: white;
  border-radius: 3px;
  background-color: orange;
  line-height: 40px;
  padding: 0px 40px;
  cursor: pointer;
  display: inline-block;
  float: right;
  margin: 20px 30px;
  &:hover {
    opacity: 0.7;
  }
`;

const Loading = styled.div`
  color: #ddd;
  margin-top: 50px;
  display: flex;
  justify-content: center;
`;

const HeaderContainer = styled.div`
  margin: 30px;
  margin-top: 0;
  display: flex;
`;

const FilterButton = styled.div`
  font-size: 13px;
  color: grey;
  margin-left: 20px;
  margin-top: 3px;

  &:hover {
    cursor: pointer;
    opacity: 0.7;
  }
`;

const Heading = styled.div`
  font-size: 18px;
`;
