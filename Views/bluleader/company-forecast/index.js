// Calculate forecast for all profit centers of a company
// for each element, the displayed result are sum of each profit center. This sum is displayed only - not stored

import React from 'react';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import ForecastReport from 'forecast-report';
import {
  Row,
  HeaderRow,
  RowLabel,
  ClickableCell,
  BoldCell,
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
  calculateForecastForCompany,
  calculateBaseData,
  getForecastEntryKey,
  getFinancialTimeFromDate,
  generateMonthArray,
} from 'utils';

const newEntry = (financialYear, month, element, amount) => ({
  newRecord: true,
  financialYear,
  financialMonth: month,
  forecastElement_id: element.id,
  forecastElement: element,
  amount: amount || '',
});

class ForecastMatrix extends React.Component {
  monthArray = [];

  state = {
    loading: true,
    company: null,
    financialYear: null,
    entries: {},
    profitCentres: [],
    blur: false,
    reportParams: null,
    calculationBaseData: null,
  };

  async componentDidMount() {
    this.monthArray = generateMonthArray();

    // Load user preferences
    const prefs = await getUserPreferences(this.props.$global.currentUser.id, this.props.$models);
    const { company_id, financialYear } = prefs;

    if (!(company_id && financialYear)) await this.setFilters();
    else {
      const company = await this.props.$models.Company.findById(company_id);
      await this.setState({
        company,
        financialYear,
      });
      await this.calculate();
    }
  }

  // Bring up a popup asking which company and financial year
  setFilters = async () => {
    const { $models, $popup } = this.props;
    const { company, financialYear } = this.state;

    const companies = await $models.Company.findAll({
      limit: 1000,
    });

    const companiesOptions = companies.map(com => ({
      id: com.id,
      label: com.name,
    }));

    $popup.form({
      fields: [
        {
          name: 'companyId',
          label: 'Company',
          type: 'FixedList',
          properties: {
            options: companiesOptions,
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
        companyId: company && company.id,
        financialYear: financialYear || getFinancialTimeFromDate().financialYear,
      },
      onSubmit: async ({ companyId, financialYear: selectedFinancialYear }) => {
        const selectedCompany = companies.find(com => com.id === companyId);

        await this.setState({
          calculationBaseData: null,
          reportParams: null,
          company: selectedCompany,
          financialYear: selectedFinancialYear,
        });
        await this.calculate();
        setUserPreferences(this.props.$global.currentUser.id, $models, {
          company_id: companyId,
          financialYear: selectedFinancialYear,
        });
      },
    });
  };

  loadData = async () => {
    const { financialYear, company } = this.state;
    if (!(financialYear && company)) return;

    this.setState({ loading: true });

    const { ProfitCentre, ForecastEntry, ForecastElement } = this.props.$models;

    // Find all profit centres
    const profitCentres = await ProfitCentre.findAll({
      where: {
        company_id: company.id,
      },
    });

    const profitCentreIds = profitCentres.map(pc => pc.id);

    const entries_array = await ForecastEntry.findAll({
      include: [{ as: 'profitCentre' }, { as: 'costCentre' }, { as: 'forecastElement' }],
      limit: 100000,
      where: {
        active: true,
        financialYear,
        profitCentre_id: {
          $in: profitCentreIds,
        },
      },
    });

    const elements = await ForecastElement.findAll({});
    const cos_elements = [];
    const rev_elements = [];
    const oh_elements = [];

    const entries = {};
    for (const entry of entries_array) {
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
          name: entry.name,
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

      // Create new entries for empty cells
      this.monthArray.forEach(month => {
        const key = getForecastEntryKey(financialYear, month.financialMonth, element.id, true);
        entries[key] = entries[key] || newEntry(financialYear, month.financialMonth, element);
      });
    }

    await this.setState({
      loading: false,
      entries,
      profitCentres,
      // elements,
      cos_elements,
      rev_elements,
      oh_elements,
      totals: this.calcTotals(entries),
    });
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
      t.cos[financialMonth] = 0.0;
      t.rev[financialMonth] = 0.0;
      t.oh[financialMonth] = 0.0;
      t.gp[financialMonth] = 0.0;
      t.np[financialMonth] = 0.0;
    });

    return t;
  };

  renderRow = element => (
    <Row>{this.monthArray.map(month => this.renderCell(month.financialMonth, element))}</Row>
  );

  renderCell = (financialMonth, element) => {
    const key = getForecastEntryKey(this.state.financialYear, financialMonth, element.id, true);
    const entry = this.state.entries[key];

    const amount = entry && entry.amount;

    return (
      <ClickableCell
        onClick={() => {
          if (amount) this.calculateReportData(financialMonth, element.key);
        }}
      >
        {amount}
      </ClickableCell>
    );
  };

  // Calculate all rows that need to, update db, reload data and calculate total
  calculate = async () => {
    this.setState({ blur: true, reportParams: {} });

    const { profitCentres, financialYear } = this.state;
    const profitCentreIds = profitCentres.map(pc => pc.id);

    // Get general data in preparation for calculations
    const calculationBaseData = await calculateBaseData({
      $models: this.props.$models,
      profitCentreIds,
    });

    await calculateForecastForCompany({
      ...calculationBaseData,
      $models: this.props.$models,
      financialYear,
      profitCentreIds,
    });

    await this.loadData();

    await this.setState(state => ({
      calculationBaseData,
      totals: this.calcTotals(state.entries),
      blur: false,
    }));
  };

  calcTotals = entries => {
    const tot = this.getZeroTotals();

    for (const key of Object.keys(entries)) {
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

  calculateReportData = async (financialMonth, elementKey, showTables) => {
    const { profitCentres, financialYear } = this.state;
    if (!profitCentres.length) return;

    this.setState({
      reportParams: {
        showTables,
        elementKey,
        financialYear,
        financialMonth,
      },
    });
  };

  render() {
    const {
      loading,
      blur,
      company,
      financialYear,
      reportParams,
      calculationBaseData,
      profitCentres,
    } = this.state;

    if (loading) {
      return <Loading>Loading...</Loading>;
    }

    if (!(company && financialYear && profitCentres)) {
      return (
        <Loading>
          Please specify a company and financial year to continue.
          <TextButton onClick={this.setFilters}>change</TextButton>
        </Loading>
      );
    }

    const profitCentreIds = profitCentres.map(pc => pc.id);

    return (
      <Container blur={blur}>
        <HeaderContainer>
          <Heading>
            Company: {company.name}, financial year {financialYear}
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

        <ForecastReport
          $models={this.props.$models}
          profitCentreIds={profitCentreIds}
          {...reportParams}
          {...calculationBaseData}
        />
      </Container>
    );
  }
}

export default ForecastMatrix;
