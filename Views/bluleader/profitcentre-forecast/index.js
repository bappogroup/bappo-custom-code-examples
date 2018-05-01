import React from 'react';
import { setUserPreferences, getUserPreferences } from 'userpreferences';
import { getFinancialTimeFromDate } from 'utils';
import Forecast from 'forecast';

class ProfitCentreForecast extends React.Component {
  state = {
    profitCentre: null,
    financialYear: null,
  };

  async componentDidMount() {
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
    }
  }

  setFilters = async () => {
    const { $models, $popup } = this.props;

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
        profitCentreId: this.state.profitCentre && this.state.profitCentre.id,
        financialYear: this.state.financialYear || getFinancialTimeFromDate().financialYear,
      },
      onSubmit: ({ profitCentreId, financialYear }) => {
        const profitCentre = profitCentres.find(pc => pc.id === profitCentreId);

        this.setState({
          profitCentre,
          financialYear,
        });

        setUserPreferences(this.props.$global.currentUser.id, $models, {
          profitcentre_id: profitCentreId,
          financialYear,
        });
      },
    });
  };

  render() {
    const { profitCentre, financialYear } = this.state;
    if (!(profitCentre && financialYear)) return null;

    const title = `Profit centre: ${profitCentre.name}`;
    return (
      <Forecast
        mode="profitCentre"
        title={title}
        financialYear={financialYear}
        profitCentreIds={[profitCentre.id]}
        setFilters={this.setFilters}
        $models={this.props.$models}
      />
    );
  }
}

export default ProfitCentreForecast;
