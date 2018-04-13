import React from 'react';
import { styled } from 'bappo-components';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import ForecastReport from 'forecast-report';
import {
  Row,
  HeaderRow,
  RowLabel,
  Cell,
  ClickableCell,
  BoldCell,
  SaveButton,
  Container,
  TableContainer,
  LabelColumnContainer,
  DataRowsContainer,
  HeaderLabel,
  Space,
  Loading,
  HeaderContainer,
  TextButton,
  Heading,
  YearLabel,
} from 'forecast-components';
import {
  calculateForecastForProfitCentre,
  calculateBaseData,
  getForecastEntryKey,
  getFinancialTimeFromDate,
  generateMonthArray,
} from 'utils';

class ForecastMatrix extends React.Component {
  monthArray = [];

  state = {
    loading: true,
    financialYear: null,
    entries: {},
    blur: false,
    reportParams: null,
    calculationBaseData: null,
    cos_elements: [],
    rev_elements: [],
    oh_elements: [],
    //
    profitCentre: null,
  };

  async componentDidMount() {
    this.monthArray = generateMonthArray();

    // Load user preferences
    const prefs = await getUserPreferences(this.props.$global.currentUser.id, this.props.$models);
    const { profitcentre_id, financialYear } = prefs;

    if (!(profitcentre_id && financialYear)) await this.setFilters();
    else {
      const profitCentre = await this.props.$models.ProfitCentre.findById(profitcentre_id);
      await this.setState({
        profitCentre,
        financialYear,
      });
      await this.loadData();
    }
  }

  // Bring up a popup asking which profit centre and time slot
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { profitCentre, financialYear } = this.state;

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
          name: 'financialYear',
          label: 'Financial Year',
          type: 'Year',
          validate: [value => (value ? undefined : 'Required')],
        },
      ],
      initialValues: {
        profitCentreId: profitCentre && profitCentre.id,
        financialYear: financialYear || getFinancialTimeFromDate().financialYear,
      },
      onSubmit: async ({ profitCentreId, financialYear }) => {
        const profitCentre = profitCentres.find(pc => pc.id === profitCentreId);

        await this.setState({
          calculationBaseData: null,
          reportParams: null,
          profitCentre,
          financialYear,
        });
        await this.loadData();
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          profitcentre_id: profitCentreId,
          financialYear,
        });
      },
    });
  };

  loadData = async () => {
    const { financialYear, profitCentre } = this.state;
    if (!(financialYear && profitCentre)) return;

    this.setState({ loading: true });

    const { ForecastEntry, ForecastElement } = this.props.$models;

    // Find all related entries
    const entriesArray = await ForecastEntry.findAll({
      include: [{ as: 'profitCentre' }, { as: 'costCentre' }, { as: 'forecastElement' }],
      limit: 100000,
      where: {
        active: true,
        financialYear,
        profitCentre_id: profitCentre.id,
      },
    });

    const elements = await ForecastElement.findAll({});
    const cos_elements = [];
    const rev_elements = [];
    const oh_elements = [];

    const entries = {};
    for (const entry of entriesArray) {
      const key = getForecastEntryKey(
        entry.financialYear,
        entry.financialMonth,
        entry.forecastElement_id,
        true,
      );

      if (!entries[key]) {
        entries[key] = {
          amount: +entry.amount,
          financialMonth: entry.financialMonth,
          financialYear: entry.financialYear,
          forecastElement: entry.forecastElement,
          forecastElement_id: entry.forecastElement_id,
          id: entry.id,
        };
      } else {
        entries[key].amount += +entry.amount;
      }
    }

    for (const element of elements) {
      switch (element.elementType) {
        case '1':
          cos_elements.push(element);
          break;
        case '2':
          rev_elements.push(element);
          break;
        case '3':
          oh_elements.push(element);
          break;
        default:
      }
    }

    await this.setState({
      loading: false,
      entries,
      cos_elements,
      rev_elements,
      oh_elements,
      totals: this.calcTotals(entries),
    });
  };

  handleCellChange = (financialMonth, forecastElement, amount) => {
    const { financialYear } = this.state;
    const key = getForecastEntryKey(financialYear, financialMonth, forecastElement.id, true);

    this.setState(({ entries, ...others }) => {
      const updatedEntries = { ...entries };
      if (!updatedEntries[key]) {
        updatedEntries[key] = {
          amount: 0,
          financialMonth,
          financialYear,
          forecastElement,
          forecastElement_id: forecastElement.id,
        };
      }
      updatedEntries[key].amount = +amount;
      return {
        ...others,
        entries: updatedEntries,
        totals: this.calcTotals(updatedEntries),
      };
    });
  };

  save = async () => {
    this.setState({ blur: true });
    const { ForecastEntry } = this.props.$models;
    const { financialYear, profitCentre, entries } = this.state;

    await ForecastEntry.destroy({
      where: {
        financialYear,
        profitCentre_id: profitCentre.id,
      },
    });

    const entriesToCreate = Object.values(entries).map(e => ({
      financialYear: e.financialYear,
      financialMonth: e.financialMonth,
      forecastElement_id: e.forecastElement_id,
      amount: +e.amount,
      costCentre_id: e.costCentre_id,
      profitCentre_id: profitCentre.id,
    }));
    await ForecastEntry.bulkCreate(entriesToCreate);
    this.setState({ blur: false });
  };

  // Calculate all rows that need to. Then update db, reload data and calculate total
  calculate = async () => {
    this.setState({ blur: true, reportParams: null });
    const { profitCentre, financialYear } = this.state;

    // Get general data in preparation for calculations
    const calculationBaseData = await calculateBaseData({
      $models: this.props.$models,
      profitCentreIds: [profitCentre.id],
    });

    await calculateForecastForProfitCentre({
      ...calculationBaseData,
      $models: this.props.$models,
      financialYear,
      profitCentre_id: profitCentre.id,
    });

    await this.loadData();

    await this.setState(state => ({
      calculationBaseData, // Cache base data for future calculations
      totals: this.calcTotals(state.entries),
      blur: false,
    }));
  };

  calcTotals = entries => {
    const tot = this.getZeroTotals();

    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry && entry.forecastElement) {
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

  getZeroTotals = () => {
    const t = {
      cos: {},
      rev: {},
      oh: {},
      gp: {},
      np: {},
    };

    this.monthArray.forEach(({ financialMonth }) => {
      t.cos[financialMonth] = 0;
      t.rev[financialMonth] = 0;
      t.oh[financialMonth] = 0;
      t.gp[financialMonth] = 0;
      t.np[financialMonth] = 0;
    });

    return t;
  };

  renderRow = element => {
    let displayOnly = false;
    switch (element.key) {
      case 'SAL':
      case 'TMREV':
      case 'FIXREV':
      case 'CWAGES':
      case 'INTCH':
      case 'INTREV':
        displayOnly = true;
        break;
      default:
    }

    return (
      <Row>
        {this.monthArray.map(month => this.renderCell(month.financialMonth, element, displayOnly))}
      </Row>
    );
  };

  renderCell = (financialMonth, element, displayOnly = false) => {
    const key = getForecastEntryKey(this.state.financialYear, financialMonth, element.id, true);
    const entry = this.state.entries[key];
    const value = entry && entry.amount;

    if (displayOnly) {
      return (
        <ClickableCell
          onClick={() => {
            if (value) this.calculateReportData(financialMonth, element.key);
          }}
        >
          {value}
        </ClickableCell>
      );
    }

    return (
      <Cell>
        <Input
          value={value}
          onChange={event => this.handleCellChange(financialMonth, element, event.target.value)}
        />
      </Cell>
    );
  };

  calculateReportData = async (financialMonth, elementKey, showTables) => {
    const { profitCentre, financialYear } = this.state;
    if (!(profitCentre && financialYear)) return;

    this.setState({
      reportParams: {
        showTables,
        elementKey,
        financialYear,
        financialMonth,
      },
    });
  };

  renderTotal = (month, key) => <BoldCell>{this.state.totals[key][month]}</BoldCell>;

  renderTotals = key => (
    <Row>{this.monthArray.map(month => this.renderTotal(month.financialMonth, key))}</Row>
  );

  renderLabelColumn = () => {
    const renderElementLabel = ({ name }) => <RowLabel>{name}</RowLabel>;
    return (
      <LabelColumnContainer>
        <RowLabel />
        {this.state.rev_elements.map(renderElementLabel)}
        <RowLabel>Total Revenue</RowLabel>
        <Space />
        {this.state.cos_elements.map(renderElementLabel)}
        <RowLabel>Total Cost of Sales</RowLabel>

        <Space />
        <RowLabel>Gross Profit</RowLabel>

        <Space />
        {this.state.oh_elements.map(renderElementLabel)}
        <RowLabel>Total Overheads</RowLabel>

        <Space />
        <RowLabel>Net Profit</RowLabel>
      </LabelColumnContainer>
    );
  };

  render() {
    const {
      loading,
      blur,
      profitCentre,
      financialYear,
      reportParams,
      calculationBaseData,
    } = this.state;

    if (!(profitCentre && financialYear)) {
      return (
        <Loading>
          Please specify a profit centre and financial year to continue.
          <TextButton onClick={this.setFilters}>change</TextButton>
        </Loading>
      );
    }
    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    return (
      <Container blur={blur}>
        <HeaderContainer>
          <Heading>
            Profit centre: {profitCentre.name}, financial year {financialYear}
          </Heading>
          <TextButton onClick={this.setFilters}>change</TextButton>
          <TextButton onClick={this.calculate}>calculate</TextButton>
        </HeaderContainer>

        <TableContainer>
          {this.renderLabelColumn()}
          <DataRowsContainer>
            <HeaderRow>
              {this.monthArray.map(({ label, financialMonth }) => (
                <ClickableCell
                  style={{ border: 'none' }}
                  onClick={() =>
                    this.calculateReportData(financialMonth, null, ['consultant', 'project'])
                  }
                >
                  {label === 'Jan' && <YearLabel>{+financialYear + 1}</YearLabel>}
                  <HeaderLabel>{label}</HeaderLabel>{' '}
                </ClickableCell>
              ))}
            </HeaderRow>
            {this.state.rev_elements.map(this.renderRow)}
            {this.renderTotals('rev')}
            <Space />
            {this.state.cos_elements.map(this.renderRow)}
            {this.renderTotals('cos')}

            <Space />
            {this.renderTotals('gp')}

            <Space />
            {this.state.oh_elements.map(this.renderRow)}
            {this.renderTotals('oh')}

            <Space />
            {this.renderTotals('np')}
          </DataRowsContainer>
        </TableContainer>

        <SaveButton onClick={this.save}>Save</SaveButton>

        <ForecastReport
          $models={this.props.$models}
          profitCentreIds={[profitCentre.id]}
          {...reportParams}
          {...calculationBaseData}
        />
      </Container>
    );
  }
}

export default ForecastMatrix;

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
