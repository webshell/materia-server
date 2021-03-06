import { IQueryParam, IQueryCondition } from '@materia/interfaces';

import { Condition } from './condition';
import { DBEntity } from '../../db-entity';
import { Query, QueryParamResolver } from '../../query';
import { MateriaError } from '../../../error';
import { Op } from 'sequelize';

/*
Conditions manage a list of condition (associated with `operand`)
Conditions structure:
[
	{
		name: string,
		operator: string,
		value: string,
		operand: string (optional|default:AND)
		priorityLevel: integer (optional|default:0)
	},
	{
		...
	}
]
*/

const SequelizeOperatorsKeys = {
	'=': Op.eq,
	'!=': Op.ne,
	'>': Op.gt,
	'>=': Op.gte,
	'<': Op.lt,
	'<=': Op.lte,
	'LIKE': Op.like,
	'NOT LIKE': Op.notLike,
	'ILIKE': Op.iLike,
	'NOT ILIKE': Op.notILike
};

export type IQueryConditions = IQueryCondition[];

export class Conditions {
	conditions: Array<Condition>;
	entity: DBEntity;

	constructor(conditions: Array<IQueryCondition>, query: Query) {
		this.conditions = [];
		this.entity = query.entity;

		if (conditions) {
			for (const condition of conditions) {
				if (condition.entity && ! this.entity.app.entities.get(condition.entity)) {
					throw new MateriaError(`Could not find entity "${condition.entity}" in condition`);
				}
				this.conditions.push(new Condition(condition, this.entity && this.entity.name));
			}
		}
	}

	toSequelize(params: Array<any>, entityName: string): Object {
		params = params || [];

		const $and = [], $or = [];
		for (const condition of this.conditions) {
			if (condition.name && condition.operator && condition.entity == entityName) {
				let cond;
				if (condition.operator == 'IS NULL') {
					cond = { [Op.eq]: null };
				} else if (condition.operator == 'IS NOT NULL') {
					cond = { [Op.ne]: null };
				} else {
					let resolvedParam = QueryParamResolver.resolve(condition, params);
					const opkey = SequelizeOperatorsKeys[condition.operator.toUpperCase()];
					cond = {};
					if (
						(condition.operator === 'LIKE'
						|| condition.operator === 'ILIKE'
						|| condition.operator === 'NOT LIKE'
						|| condition.operator === 'NOT ILIKE')
						&& (! resolvedParam.includes('%') && ! resolvedParam.includes('_'))
					) {
						resolvedParam = `%${resolvedParam}%`;
					}
					cond[opkey] = resolvedParam;
				}
				cond = { [condition.name]: cond };

				if (condition.operand && condition.operand.toUpperCase() == 'OR') {
					$or.push(cond);
				} else {
					$and.push(cond);
				}
			}
		}

		if ($or.length) {
			if ($and.length) {
				if ($and.length == 1) {
					$or.push($and[0]);
				} else {
					$or.push({ $and: $and });
				}
			}
			if ($or.length == 1) {
				return $or[0];
			} else {
				return { [Op.or]: $or };
			}
		} else if ($and.length) {
			if ($and.length == 1) {
				return $and[0];
			} else {
				return { [Op.and]: $and };
			}
		}
	}

	constructConditions(entities, params) {
		for (const entity of entities) {
			for (const condition of this.conditions) {
				if (condition && condition.entity == entity.model.name) {
					entity.where = this.toSequelize(params, condition.entity);
				}
				if (entity.include) {
					this.constructConditions(entity.include, params);
				}
			}
		}
	}

	discoverParams(): Array<IQueryParam> {
		const params = [] as IQueryParam[];
		this.conditions.forEach(condition => {
			if (condition.valueIsParam()) {
				let field;
				if (condition.entity != this.entity.name) {
					field = this.entity.app.entities.get(condition.entity).getField(condition.name);
				} else {
					field = this.entity.getField(condition.name);
				}

				if ( ! field) {
					// impossible to find field ${condition.entity}.${condition.name} in query ${this.query.id}
				}

				let paramName = condition.name;
				if (condition.value.length > 1) {
					paramName = condition.value.substr(1);
				}
				params.push({
					name: paramName,
					reference: {
						entity: condition.entity,
						field: condition.name
					},
					type: field.type,
					component: field.component,
					required: true
				});
			}
		});
		return params;
	}

	toJson() {
		const res = [];
		this.conditions.forEach((condition) => {
			res.push(condition.toJson());
		});
		return res;
	}
}