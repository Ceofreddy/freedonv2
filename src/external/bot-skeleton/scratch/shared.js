import filesaver from 'file-saver';
import { config } from '../constants/config';

export const saveAs = ({ data, filename, type }) => {
    const blob = new Blob([data], { type });
    filesaver.saveAs(blob, filename);
};

export const getContractTypeOptions = (contract_type, trade_type) => {
    const all_trade_types = Object.values(config().opposites).flat();
    const contract_options = all_trade_types.map(type => Object.entries(type)[0].reverse());

    return contract_options;


};
