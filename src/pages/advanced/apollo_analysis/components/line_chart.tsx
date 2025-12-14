import React, { PureComponent } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

type LineChartProps = {
    name: string;
    value: number;
};

interface ApolloLineChartProps {
    data: LineChartProps[];
}

export default class ApolloLineChart extends PureComponent<ApolloLineChartProps> {
    render() {
        const { data } = this.props;
        let last10Elements;
        if (data.length > 9) {
            last10Elements = data.slice(-10);
        }

        return (
            <ResponsiveContainer width='100%' height='100%' style={{ padding: '10px 0px' }}>
                <LineChart width={300} height={100} data={data.length > 9 ? last10Elements : data}>
                    <Line
                        isAnimationActive={false}
                        key='line'
                        type='monotone'
                        dataKey='value'
                        stroke='#8884d8'
                        strokeWidth={2}
                        dot={props => {
                            const { cx, cy, value } = props;
                            return (
                                <g>
                                    <circle cx={cx} cy={cy} r={4} fill='#8884d8' />
                                    <text
                                        x={cx}
                                        y={cy}
                                        dy={-10}
                                        textAnchor='end'
                                        fill={value > 0 ? '#00a79e' : '#cc2e3d'}
                                    >
                                        {value}
                                    </text>
                                </g>
                            );
                        }}
                    />
                </LineChart>
            </ResponsiveContainer>
        );
    }
}
