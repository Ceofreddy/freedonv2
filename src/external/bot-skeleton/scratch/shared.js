import filesaver from 'file-saver';
import { config } from '../constants/config';

export const saveAs = ({ data, filename, type }) => {
    const blob = new Blob([data], { type });
    filesaver.saveAs(blob, filename);
};

export const getContractTypeOptions = (contract_type, trade_type) => {
    const trade_types = config().opposites[trade_type.toUpperCase()];

    if (!trade_types) {
        return config().NOT_AVAILABLE_DROPDOWN_OPTIONS;
    }

    const contract_options = trade_types.map(type => Object.entries(type)[0].reverse());

    // Return all contract types for the selected trade type
    return contract_options;


};
